import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GradingMode, SubmissionStatus } from '@missngoc/core';
import { AccessService } from '../../common/access/access.service';
import type { AuthUser } from '../../common/auth-user';
import { compareVietnameseNames } from '../../common/text';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildGradebook, type Gradebook, type GbStudent } from './gradebook-grid';
import { DEFAULT_GRADEBOOK_TEMPLATE, GRADEBOOK_TEMPLATE_NAME, GradebookTemplateSchema, type GradebookTemplate } from './gradebook-template';

export interface AttendanceInput {
  studentId: string;
  /** undefined: giữ nguyên; null: xoá */
  status?: string | null;
  homework?: string | null;
}

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;

/** "T10/2026" khi lọc đúng một tháng, "01/10 – 15/10" khi lọc khoảng khác, "Cả khoá" khi không lọc */
export function periodLabel(from?: Date, to?: Date): string {
  if (!from && !to) return 'Cả khoá';
  if (from && to) {
    const lastDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    if (from.getUTCDate() === 1 && to.getTime() === lastDay.getTime()) return `T${from.getUTCMonth() + 1}/${from.getUTCFullYear()}`;
    return `${ddmm(from)} – ${ddmm(to)}`;
  }
  return from ? `Từ ${ddmm(from)}` : `Đến ${ddmm(to!)}`;
}

@Injectable()
export class GradebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async template(): Promise<GradebookTemplate> {
    const t = await this.prisma.reportTemplate.findFirst({ where: { name: GRADEBOOK_TEMPLATE_NAME } });
    const parsed = GradebookTemplateSchema.safeParse(t?.config);
    return parsed.success ? parsed.data : DEFAULT_GRADEBOOK_TEMPLATE;
  }

  async saveTemplate(user: AuthUser, config: unknown) {
    const parsed = GradebookTemplateSchema.safeParse(config);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const existing = await this.prisma.reportTemplate.findFirst({ where: { name: GRADEBOOK_TEMPLATE_NAME } });
    if (existing) {
      await this.prisma.reportTemplate.update({ where: { id: existing.id }, data: { config: parsed.data } });
    } else {
      await this.prisma.reportTemplate.create({ data: { name: GRADEBOOK_TEMPLATE_NAME, isDefault: false, config: parsed.data } });
    }
    await this.audit.log({ actorId: user.id, action: 'gradebook-template.update', entity: 'report-template', before: existing?.config, after: parsed.data });
    return parsed.data;
  }

  /** Sổ điểm của lớp trong khoảng ngày (không truyền thì cả khoá) */
  async build(user: AuthUser, classId: string, fromStr?: string, toStr?: string): Promise<Gradebook> {
    const cls = await this.access.assertClass(user, classId);
    const from = fromStr ? toDate(fromStr) : undefined;
    const to = toStr ? toDate(toStr) : undefined;
    if (from && to && from > to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    const dateRange: Prisma.DateTimeFilter = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [template, allSessions, exams, enrollments] = await Promise.all([
      this.template(),
      this.prisma.classSession.findMany({ where: { classId }, orderBy: { date: 'asc' } }),
      this.prisma.exam.findMany({
        where: { classId, examDate: dateRange },
        include: { category: true },
        orderBy: [{ examDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.enrollment.findMany({ where: { classId, leftAt: null }, include: { student: true } }),
    ]);

    // Số buổi tính trên cả khoá để B3 vẫn là B3 khi lọc theo tháng
    const sessions = allSessions
      .map((s, i) => ({ id: s.id, date: s.date, number: i + 1, note: s.note }))
      .filter((s) => (!from || s.date >= from) && (!to || s.date <= to));

    const [subs, attendances] = await Promise.all([
      this.prisma.submission.findMany({
        where: { examId: { in: exams.map((e) => e.id) } },
        select: { id: true, examId: true, studentId: true, status: true, result: { select: { score: true } }, student: true },
      }),
      this.prisma.attendance.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        include: { student: true },
      }),
    ]);

    // Học sinh đang học, cộng học sinh đã rời lớp nhưng có điểm hoặc điểm danh trong khoảng này
    const students = new Map<string, GbStudent>();
    for (const e of enrollments) students.set(e.studentId, { id: e.studentId, studentCode: e.student.studentCode, fullName: e.student.fullName, inClass: true });
    for (const st of [...subs.map((s) => s.student), ...attendances.map((a) => a.student)]) {
      if (!students.has(st.id)) students.set(st.id, { id: st.id, studentCode: st.studentCode, fullName: st.fullName, inClass: false });
    }
    const studentList = [...students.values()].sort((a, b) => Number(b.inClass) - Number(a.inClass) || compareVietnameseNames(a.fullName, b.fullName));

    return buildGradebook(
      {
        className: cls.name,
        periodLabel: periodLabel(from, to),
        students: studentList,
        sessions,
        exams: exams.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.examDate,
          gradingMode: e.gradingMode as GradingMode,
          maxScore: Number(e.maxScore),
          weight: Number(e.weight ?? e.category?.weight ?? 1),
          categoryName: e.category?.name ?? null,
          headerFill: e.category?.headerFill ?? template.scoreHeader.fill,
          headerFont: e.category?.headerFont ?? template.scoreHeader.font,
        })),
        scores: subs.map((s) => ({
          examId: s.examId,
          studentId: s.studentId,
          submissionId: s.id,
          status: s.status as SubmissionStatus,
          score: s.result ? Number(s.result.score) : null,
        })),
        attendances: attendances.map((a) => ({ sessionId: a.sessionId, studentId: a.studentId, status: a.status, homework: a.homework })),
      },
      template,
    );
  }

  async createSession(user: AuthUser, classId: string, date: string, note?: string) {
    const cls = await this.access.assertClass(user, classId);
    if (cls.status !== 'ACTIVE') throw new BadRequestException('Lớp đã lưu trữ');
    try {
      const s = await this.prisma.classSession.create({ data: { classId, date: toDate(date), note: note || null } });
      await this.audit.log({ actorId: user.id, action: 'session.create', entity: 'class', entityId: classId, after: { sessionId: s.id, date, note } });
      return s;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Lớp đã có buổi học ngày ${ddmm(toDate(date))}`);
      }
      throw err;
    }
  }

  async updateSession(user: AuthUser, sessionId: string, data: { date?: string; note?: string | null }) {
    const s = await this.assertSession(user, sessionId);
    try {
      const updated = await this.prisma.classSession.update({
        where: { id: sessionId },
        data: { date: data.date ? toDate(data.date) : undefined, note: data.note === undefined ? undefined : data.note || null },
      });
      await this.audit.log({ actorId: user.id, action: 'session.update', entity: 'class', entityId: s.classId, before: s, after: data });
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Lớp đã có buổi học ngày này');
      throw err;
    }
  }

  /** Xoá buổi học kèm điểm danh và bài tập của buổi đó */
  async deleteSession(user: AuthUser, sessionId: string) {
    const s = await this.assertSession(user, sessionId);
    const count = await this.prisma.attendance.count({ where: { sessionId } });
    await this.prisma.classSession.delete({ where: { id: sessionId } });
    await this.audit.log({ actorId: user.id, action: 'session.delete', entity: 'class', entityId: s.classId, before: { ...s, attendanceCount: count } });
    return { deleted: true };
  }

  /** Điểm danh và bài tập của một hay nhiều học sinh trong một buổi */
  async setAttendance(user: AuthUser, sessionId: string, items: AttendanceInput[]) {
    const s = await this.assertSession(user, sessionId);
    const template = await this.template();
    const attCodes = new Set(template.attendanceCodes.map((c) => c.code));
    const hwCodes = new Set(template.homeworkCodes.map((c) => c.code));
    for (const it of items) {
      if (it.status && !attCodes.has(it.status)) throw new BadRequestException(`Mã điểm danh "${it.status}" không có trong mẫu sổ điểm`);
      if (it.homework && !hwCodes.has(it.homework)) throw new BadRequestException(`Mã bài tập "${it.homework}" không có trong mẫu sổ điểm`);
    }
    const enrolled = await this.prisma.enrollment.findMany({
      where: { classId: s.classId, studentId: { in: items.map((i) => i.studentId) } },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentId));
    const outside = items.find((i) => !enrolledIds.has(i.studentId));
    if (outside) throw new BadRequestException('Có học sinh không thuộc lớp này');

    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        const key = { sessionId_studentId: { sessionId, studentId: it.studentId } };
        const existing = await tx.attendance.findUnique({ where: key });
        const status = it.status === undefined ? (existing?.status ?? null) : it.status;
        const homework = it.homework === undefined ? (existing?.homework ?? null) : it.homework;
        if (status === null && homework === null) {
          if (existing) await tx.attendance.delete({ where: key });
        } else {
          await tx.attendance.upsert({
            where: key,
            create: { sessionId, studentId: it.studentId, status, homework, updatedById: user.id },
            update: { status, homework, updatedById: user.id },
          });
        }
      }
    });
    return { updated: items.length };
  }

  /** Nhập điểm tay cho bài MANUAL. absent: vắng (không tính vào trung bình); score null: xoá điểm */
  async setScore(user: AuthUser, examId: string, studentId: string, body: { score: number | null; absent?: boolean }) {
    const exam = await this.access.assertExam(user, examId);
    if (exam.gradingMode !== 'MANUAL') throw new BadRequestException('Bài này chấm bằng AI, sửa điểm ở trang duyệt bài');
    if (exam.status !== 'OPEN') throw new BadRequestException('Bài kiểm tra đã lưu trữ');
    const enrolled = await this.prisma.enrollment.findFirst({ where: { classId: exam.classId, studentId } });
    if (!enrolled) throw new BadRequestException('Học sinh không thuộc lớp của bài kiểm tra này');
    const max = Number(exam.maxScore);
    if (body.score !== null && (body.score < 0 || body.score > max)) throw new BadRequestException(`Điểm phải từ 0 đến ${max}`);

    const status: SubmissionStatus = body.absent ? 'ABSENT' : body.score === null ? 'NO_IMAGE' : 'GRADED';
    const before = await this.prisma.submission.findUnique({
      where: { examId_studentId: { examId, studentId } },
      include: { result: true },
    });
    await this.prisma.$transaction(async (tx) => {
      const sub = await tx.submission.upsert({
        where: { examId_studentId: { examId, studentId } },
        create: { examId, studentId, status },
        update: { status, version: { increment: 1 } },
      });
      if (status === 'GRADED') {
        await tx.result.upsert({
          where: { submissionId: sub.id },
          create: { submissionId: sub.id, correctCount: 0, score: body.score! },
          update: { score: body.score!, gradedAt: new Date() },
        });
      } else {
        await tx.result.deleteMany({ where: { submissionId: sub.id } });
      }
      await this.audit.log(
        {
          actorId: user.id,
          action: 'exam.score.update',
          entity: 'submission',
          entityId: sub.id,
          before: before ? { status: before.status, score: before.result ? Number(before.result.score) : null } : null,
          after: { status, score: status === 'GRADED' ? body.score : null },
        },
        tx,
      );
    });
    return { examId, studentId, status, score: status === 'GRADED' ? body.score : null };
  }

  private async assertSession(user: AuthUser, sessionId: string) {
    const s = await this.prisma.classSession.findUnique({ where: { id: sessionId } });
    if (!s) throw new NotFoundException('Không tìm thấy buổi học');
    await this.access.assertClass(user, s.classId);
    return s;
  }
}
