import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeTextAnswer, type QuestionKind, type SubmissionStatus } from '@missngoc/core';
import { AccessService } from '../../common/access/access.service';
import type { AuthUser } from '../../common/auth-user';
import { compareVietnameseNames } from '../../common/text';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveVersion } from '../grading/services/scoring.service';
import { buildReportGrid, type ReportStudent } from './report-grid';
import { DEFAULT_REPORT_TEMPLATE, ReportTemplateSchema, type ReportTemplateConfig } from './report-template';

export interface QuestionStat {
  q: number;
  kind: QuestionKind;
  correct: string[];
  answered: number;
  correctRate: number | null;
  counts: Record<string, number>;
  topWrong: { choice: string; count: number } | null;
}

export interface QuestionStatsVersion {
  versionCode: string;
  submissions: number;
  questions: QuestionStat[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async template(): Promise<ReportTemplateConfig> {
    const t = await this.prisma.reportTemplate.findFirst({ where: { isDefault: true } });
    const parsed = ReportTemplateSchema.safeParse(t?.config);
    return parsed.success ? parsed.data : DEFAULT_REPORT_TEMPLATE;
  }

  async saveTemplate(user: AuthUser, config: unknown) {
    const parsed = ReportTemplateSchema.safeParse(config);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const existing = await this.prisma.reportTemplate.findFirst({ where: { isDefault: true } });
    if (existing) {
      await this.prisma.reportTemplate.update({ where: { id: existing.id }, data: { config: parsed.data } });
    } else {
      await this.prisma.reportTemplate.create({ data: { name: 'Mặc định', isDefault: true, config: parsed.data } });
    }
    await this.audit.log({ actorId: user.id, action: 'report-template.update', entity: 'report-template', before: existing?.config, after: parsed.data });
    return parsed.data;
  }

  async grid(user: AuthUser, examId: string) {
    const { exam, students, keys } = await this.load(user, examId);
    const textQuestions = [...new Set(keys.flatMap((k) => k.items.filter((i) => i.kind === 'text').map((i) => i.questionNo)))];
    return buildReportGrid(
      {
        title: exam.title,
        className: exam.class.name,
        examDate: exam.examDate,
        questionCount: exam.questionCount,
        maxScore: Number(exam.maxScore),
        textQuestions,
      },
      students,
      await this.template(),
    );
  }

  /** % đúng từng câu và lựa chọn sai phổ biến nhất, tách theo mã đề (UC-14) */
  async stats(user: AuthUser, examId: string): Promise<QuestionStatsVersion[]> {
    const { exam, students, keys } = await this.load(user, examId);
    const out: QuestionStatsVersion[] = [];
    for (const key of keys) {
      const subs = students.filter(
        (s) => s.score !== null && resolveVersion(s.versionCode, keys) === key.versionCode,
      );
      const questions: QuestionStat[] = key.items.map((item) => {
        const counts: Record<string, number> = {};
        const wrongCounts: Record<string, number> = {};
        let correctN = 0;
        let answered = 0;
        for (const s of subs) {
          const a = s.answers.get(item.questionNo);
          if (!a) continue;
          answered++;
          // Điền từ: "Twice" và "twice." tính là một
          const k = a.finalChoice === null ? 'Bỏ trống' : item.kind === 'text' ? normalizeTextAnswer(a.finalChoice) : a.finalChoice;
          counts[k] = (counts[k] ?? 0) + 1;
          if (a.isCorrect) correctN++;
          else wrongCounts[k] = (wrongCounts[k] ?? 0) + 1;
        }
        const wrong = Object.entries(wrongCounts).sort((a, b) => b[1] - a[1])[0];
        return {
          q: item.questionNo,
          kind: item.kind,
          correct: item.correct,
          answered,
          correctRate: answered ? Math.round((correctN / answered) * 1000) / 1000 : null,
          counts,
          topWrong: wrong ? { choice: wrong[0], count: wrong[1] } : null,
        };
      });
      out.push({ versionCode: key.versionCode, submissions: subs.length, questions });
    }
    return out.filter((v) => v.submissions > 0 || keys.length === 1);
  }

  async examMeta(user: AuthUser, examId: string) {
    const exam = await this.access.assertExam(user, examId);
    return { title: exam.title, className: exam.class.name };
  }

  private async load(user: AuthUser, examId: string) {
    const exam = await this.access.assertExam(user, examId);
    const [enrollments, subs, keys] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { classId: exam.classId, leftAt: null }, include: { student: true } }),
      this.prisma.submission.findMany({
        where: { examId },
        include: { student: true, result: true, answers: { select: { questionNo: true, finalChoice: true, isCorrect: true } } },
      }),
      this.prisma.answerKey.findMany({
        where: { examId },
        include: { items: { orderBy: { questionNo: 'asc' } } },
        orderBy: { versionCode: 'asc' },
      }),
    ]);
    const bySid = new Map(subs.map((s) => [s.studentId, s]));
    const enrolledIds = new Set(enrollments.map((e) => e.studentId));
    const studentList = [
      ...enrollments.map((e) => e.student),
      ...subs.filter((s) => !enrolledIds.has(s.studentId)).map((s) => s.student),
    ].sort((a, b) => compareVietnameseNames(a.fullName, b.fullName));

    const students: ReportStudent[] = studentList.map((st) => {
      const s = bySid.get(st.id);
      return {
        studentId: st.id,
        studentCode: st.studentCode,
        fullName: st.fullName,
        submissionId: s?.id ?? null,
        status: (s?.status ?? 'NO_IMAGE') as SubmissionStatus,
        versionCode: s?.versionCode ?? null,
        score: s?.result ? Number(s.result.score) : null,
        correctCount: s?.result?.correctCount ?? null,
        answers: new Map((s?.answers ?? []).map((a) => [a.questionNo, { finalChoice: a.finalChoice, isCorrect: a.isCorrect }])),
      };
    });
    return { exam, students, keys };
  }
}
