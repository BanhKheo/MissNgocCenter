import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasAnyPermission, PMS, SUBMISSION_STATUSES, type SubmissionStatus } from '@missngoc/core';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { paged, skipTake } from '../../../common/pagination';
import { compareVietnameseNames } from '../../../common/text';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { ExamCreateRequestDto, ExamFilterRequestDto, ExamUpdateRequestDto } from '../dto/exam.dto';

const examInclude = {
  class: { select: { id: true, name: true, teacherId: true } },
  category: { select: { id: true, name: true, weight: true } },
  answerKeys: { include: { _count: { select: { items: true } } } },
} satisfies Prisma.ExamInclude;

type ExamRow = Prisma.ExamGetPayload<{ include: typeof examInclude }>;
export type StatusCounts = Record<SubmissionStatus, number> & { total: number };

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: ExamFilterRequestDto) {
    const where: Prisma.ExamWhereInput = {
      status: q.status ?? 'OPEN',
      class: this.access.classWhere(user),
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.keyword ? { title: { contains: q.keyword, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.exam.findMany({
        where,
        include: examInclude,
        orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.exam.count({ where }),
    ]);
    const counts = await this.statusCounts(rows);
    return paged(
      rows.map((e) => this.toResponse(e, counts.get(e.id)!)),
      total,
      q,
    );
  }

  async get(user: AuthUser, id: string) {
    await this.access.assertExam(user, id);
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id }, include: examInclude });
    const counts = await this.statusCounts([exam]);
    return this.toResponse(exam, counts.get(id)!);
  }

  async create(actor: AuthUser, dto: ExamCreateRequestDto) {
    const manual = dto.gradingMode === 'MANUAL';
    if (!manual && !hasAnyPermission(actor.permissions, [PMS.EXAM_AD])) {
      throw new ForbiddenException('Bạn chỉ tạo được bài nhập điểm tay');
    }
    const cls = await this.access.assertClass(actor, dto.classId);
    if (cls.status !== 'ACTIVE') throw new BadRequestException('Lớp đã lưu trữ');
    const exam = await this.prisma.exam.create({
      data: {
        classId: dto.classId,
        title: dto.title,
        examDate: new Date(dto.examDate),
        gradingMode: manual ? 'MANUAL' : 'AI',
        categoryId: dto.categoryId ?? null,
        weight: dto.weight ?? null,
        // Bài nhập điểm tay không có câu hỏi và đáp án
        questionCount: manual ? 0 : dto.questionCount,
        options: manual ? 'ABCD' : dto.options,
        maxScore: dto.maxScore ?? 10,
        layoutHint: manual ? null : dto.layoutHint || null,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'exam.create', entity: 'exam', entityId: exam.id, after: dto });
    return this.get(actor, exam.id);
  }

  async update(actor: AuthUser, id: string, dto: ExamUpdateRequestDto) {
    const before = await this.access.assertExam(actor, id);
    if (before.gradingMode !== 'MANUAL' && !hasAnyPermission(actor.permissions, [PMS.EXAM_AD])) {
      throw new ForbiddenException('Bạn chỉ sửa được bài nhập điểm tay');
    }
    if (before.gradingMode === 'MANUAL' &&(dto.questionCount !== undefined || dto.options !== undefined)) {
      throw new BadRequestException('Bài nhập điểm tay không có số câu và bộ lựa chọn');
    }
    if (dto.maxScore !== undefined && before.gradingMode === 'MANUAL' && dto.maxScore !== Number(before.maxScore)) {
      const over = await this.prisma.result.count({ where: { submission: { examId: id }, score: { gt: dto.maxScore } } });
      if (over > 0) throw new ConflictException(`Có ${over} học sinh đã có điểm lớn hơn ${dto.maxScore}. Sửa điểm trước khi đổi thang điểm`);
    }
    const changesShape =
      (dto.questionCount !== undefined && dto.questionCount !== before.questionCount) ||
      (dto.options !== undefined && dto.options !== before.options);
    if (changesShape) {
      const graded = await this.prisma.submissionAnswer.count({ where: { submission: { examId: id } } });
      if (graded > 0) throw new ConflictException('Bài đã có kết quả chấm, không đổi được số câu hoặc bộ lựa chọn');
    }
    await this.prisma.exam.update({
      where: { id },
      data: {
        title: dto.title,
        examDate: dto.examDate ? new Date(dto.examDate) : undefined,
        categoryId: dto.categoryId,
        weight: dto.weight,
        questionCount: dto.questionCount,
        options: dto.options,
        maxScore: dto.maxScore,
        layoutHint: dto.layoutHint,
        status: dto.status,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'exam.update', entity: 'exam', entityId: id, before, after: dto });
    return this.get(actor, id);
  }

  /** Mã nguồn ExamDSL đã lưu; null nếu bài chưa soạn bằng ExamDSL */
  async getDsl(actor: AuthUser, id: string) {
    const exam = await this.access.assertExam(actor, id);
    return { source: exam.dslSource };
  }

  async putDsl(actor: AuthUser, id: string, source: string) {
    const before = await this.access.assertExam(actor, id);
    await this.prisma.exam.update({ where: { id }, data: { dslSource: source } });
    await this.audit.log({
      actorId: actor.id,
      action: 'exam.dsl',
      entity: 'exam',
      entityId: id,
      before: { dslSource: before.dslSource },
      after: { dslSource: source },
    });
    return { source };
  }

  /**
   * Kết quả AI đọc gần nhất của từng bài, để trang soạn đề chạy thử luật duyệt trên bài thật.
   * Định dạng giống data/manual-extractions/*.json mà bộ thông dịch ExamDSL đọc được.
   */
  async dslSheets(actor: AuthUser, id: string) {
    await this.access.assertExam(actor, id);
    const subs = await this.prisma.submission.findMany({
      where: { examId: id, extractions: { some: {} } },
      include: {
        student: { select: { fullName: true } },
        extractions: { orderBy: { createdAt: 'desc' }, take: 1, select: { rawJson: true } },
      },
    });
    return {
      submissions: subs
        .map((s) => ({ studentName: s.student.fullName, raw: s.extractions[0].rawJson }))
        .sort((a, b) => compareVietnameseNames(a.studentName, b.studentName)),
    };
  }

  private toResponse(e: ExamRow, counts: StatusCounts) {
    return {
      id: e.id,
      title: e.title,
      examDate: e.examDate,
      gradingMode: e.gradingMode,
      category: e.category ? { id: e.category.id, name: e.category.name, weight: Number(e.category.weight) } : null,
      weight: e.weight === null ? null : Number(e.weight),
      // Hệ số dùng khi tính điểm trung bình: riêng của bài, không có thì theo loại bài, không có loại thì 1
      effectiveWeight: Number(e.weight ?? e.category?.weight ?? 1),
      questionCount: e.questionCount,
      options: e.options,
      maxScore: Number(e.maxScore),
      layoutHint: e.layoutHint,
      status: e.status,
      class: { id: e.class.id, name: e.class.name },
      answerKeys: e.answerKeys
        .map((k) => ({
          versionCode: k.versionCode,
          itemCount: k._count.items,
          complete: k._count.items === e.questionCount,
        }))
        .sort((a, b) => a.versionCode.localeCompare(b.versionCode)),
      counts,
    };
  }

  /** Đếm bài theo trạng thái. Học sinh chưa có bài nộp tính là "Chưa có ảnh". */
  async statusCounts(exams: { id: string; classId: string }[]): Promise<Map<string, StatusCounts>> {
    const examIds = exams.map((e) => e.id);
    const classIds = [...new Set(exams.map((e) => e.classId))];
    const [grouped, enrolled] = await Promise.all([
      this.prisma.submission.groupBy({ by: ['examId', 'status'], where: { examId: { in: examIds } }, _count: { _all: true } }),
      this.prisma.enrollment.groupBy({ by: ['classId'], where: { classId: { in: classIds }, leftAt: null }, _count: { _all: true } }),
    ]);
    const enrolledBy = new Map(enrolled.map((e) => [e.classId, e._count._all]));
    const out = new Map<string, StatusCounts>();
    for (const exam of exams) {
      const counts = Object.fromEntries(SUBMISSION_STATUSES.map((s) => [s, 0])) as StatusCounts;
      for (const g of grouped.filter((x) => x.examId === exam.id)) counts[g.status] = g._count._all;
      const withSubmission = SUBMISSION_STATUSES.filter((s) => s !== 'NO_IMAGE').reduce((sum, s) => sum + counts[s], 0);
      counts.total = Math.max(enrolledBy.get(exam.classId) ?? 0, withSubmission);
      counts.NO_IMAGE = counts.total - withSubmission;
      out.set(exam.id, counts);
    }
    return out;
  }
}

