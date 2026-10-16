import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { SubmissionStatus } from '@missngoc/core';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueueService } from '../../../queue/queue.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class GradingRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  /** Generate: mỗi bài có ảnh chưa chấm thành 1 job. Chấm lại thì đưa cả bài đã chấm vào hàng đợi. */
  async create(user: AuthUser, examId: string, regrade: boolean) {
    const exam = await this.access.assertExam(user, examId);
    if (exam.status !== 'OPEN') throw new BadRequestException('Bài kiểm tra đã lưu trữ');

    const keys = await this.prisma.answerKey.findMany({
      where: { examId },
      include: { _count: { select: { items: true } } },
    });
    if (keys.length === 0) throw new BadRequestException('Chưa có đáp án. Tải đáp án lên trước khi bấm Generate');
    const incomplete = keys.filter((k) => k._count.items !== exam.questionCount);
    if (incomplete.length > 0) {
      const names = incomplete.map((k) => k.versionCode || 'chung').join(', ');
      throw new BadRequestException(`Đáp án mã đề ${names} chưa đủ ${exam.questionCount} câu`);
    }

    const statuses: SubmissionStatus[] = regrade ? ['UPLOADED', 'FAILED', 'GRADED', 'NEEDS_REVIEW'] : ['UPLOADED', 'FAILED'];
    const subs = await this.prisma.submission.findMany({
      where: { examId, status: { in: statuses }, images: { some: {} } },
      include: { images: { select: { sha256: true }, orderBy: { pageNo: 'asc' } } },
    });
    if (subs.length === 0) {
      throw new BadRequestException(
        regrade ? 'Chưa có bài nào có ảnh' : 'Không có bài mới cần chấm. Chọn "Chấm lại" nếu muốn chấm lại tất cả',
      );
    }

    const ids = subs.map((s) => s.id);
    const run = await this.prisma.$transaction(async (tx) => {
      await tx.submission.updateMany({ where: { id: { in: ids } }, data: { status: 'QUEUED', lastError: null } });
      return tx.gradingRun.create({ data: { examId, regrade, submissionIds: ids, createdById: user.id } });
    });

    // Khoá job = bài nộp + hash ảnh: bấm Generate 2 lần cũng không gọi AI 2 lần cho cùng một bộ ảnh
    for (const s of subs) {
      const imagesHash = createHash('sha256')
        .update(s.images.map((i) => i.sha256).join(','))
        .digest('hex')
        .slice(0, 16);
      await this.queue.enqueueGrade({ submissionId: s.id, runId: run.id, regrade }, `${s.id}:${imagesHash}`);
    }
    await this.audit.log({ actorId: user.id, action: 'grading.run', entity: 'exam', entityId: examId, after: { runId: run.id, total: ids.length, regrade } });
    return this.progress(user, examId, run.id);
  }

  async progress(user: AuthUser, examId: string, runId: string) {
    await this.access.assertExam(user, examId);
    const run = await this.prisma.gradingRun.findFirst({ where: { id: runId, examId } });
    if (!run) throw new NotFoundException('Không tìm thấy lượt chấm');
    return this.toProgress(run);
  }

  async latest(user: AuthUser, examId: string) {
    await this.access.assertExam(user, examId);
    const run = await this.prisma.gradingRun.findFirst({ where: { examId }, orderBy: { createdAt: 'desc' } });
    return run ? this.toProgress(run) : null;
  }

  private async toProgress(run: { id: string; examId: string; regrade: boolean; submissionIds: string[]; createdAt: Date }) {
    const grouped = await this.prisma.submission.groupBy({
      by: ['status'],
      where: { id: { in: run.submissionIds } },
      _count: { _all: true },
    });
    const counts: Partial<Record<SubmissionStatus, number>> = {};
    for (const g of grouped) counts[g.status] = g._count._all;
    const pending = (counts.QUEUED ?? 0) + (counts.PROCESSING ?? 0);
    const total = run.submissionIds.length;
    return {
      id: run.id,
      examId: run.examId,
      regrade: run.regrade,
      createdAt: run.createdAt,
      total,
      done: total - pending,
      finished: pending === 0,
      counts,
    };
  }
}
