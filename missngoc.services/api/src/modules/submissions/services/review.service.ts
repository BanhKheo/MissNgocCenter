import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UNCERTAIN_STATUSES } from '@missngoc/core';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ScoringService } from '../../grading/services/scoring.service';
import { SubmissionsService } from './submissions.service';

/** Header If-Match: số version của bài (khoá lạc quan). Bắt buộc khi sửa điểm tay. */
export function parseIfMatch(header: string | undefined): number {
  if (!header) throw new HttpException('Thiếu header If-Match (version của bài)', HttpStatus.PRECONDITION_REQUIRED);
  const n = Number(header.replace(/^W\//, '').replace(/"/g, '').trim());
  if (!Number.isInteger(n)) throw new BadRequestException('If-Match không hợp lệ');
  return n;
}

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly scoring: ScoringService,
    private readonly submissions: SubmissionsService,
  ) {}

  /** Sửa 1 câu khi duyệt. 2 người sửa cùng lúc thì người sau nhận 412. */
  async updateAnswer(user: AuthUser, submissionId: string, q: number, value: string | null, ifMatch: number) {
    const sub = await this.load(user, submissionId, ifMatch);
    // Các mã đề cùng loại câu, nên lấy loại câu ở mã đề nào cũng được
    const keyItem = await this.prisma.answerKeyItem.findFirst({
      where: { answerKey: { examId: sub.examId }, questionNo: q },
      select: { kind: true },
    });
    let finalChoice = value;
    if (keyItem?.kind === 'text') {
      finalChoice = value?.replace(/\s+/g, ' ').trim() || null;
    } else if (value !== null && (value.length !== 1 || !sub.exam.options.includes(value))) {
      throw new BadRequestException(`Lựa chọn phải thuộc ${sub.exam.options}`);
    }
    const before = await this.prisma.submissionAnswer.findUnique({
      where: { submissionId_questionNo: { submissionId, questionNo: q } },
    });
    if (!before) throw new NotFoundException(`Không có câu ${q}`);

    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, submissionId, ifMatch);
      await tx.submissionAnswer.update({
        where: { submissionId_questionNo: { submissionId, questionNo: q } },
        data: { finalChoice, reviewedById: user.id, reviewedAt: new Date() },
      });
      await this.scoring.rescoreSubmission(tx, submissionId);
      await this.audit.log(
        {
          actorId: user.id,
          action: 'submission.answer.update',
          entity: 'submission',
          entityId: submissionId,
          before: { q, finalChoice: before.finalChoice },
          after: { q, finalChoice },
        },
        tx,
      );
    });
    return this.submissions.detail(user, submissionId);
  }

  /** "Duyệt xong": giữ nguyên các câu còn lại như AI đọc, bỏ cảnh báo tên */
  async confirm(user: AuthUser, submissionId: string, ifMatch: number) {
    await this.load(user, submissionId, ifMatch);
    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, submissionId, ifMatch);
      const res = await tx.submissionAnswer.updateMany({
        where: { submissionId, status: { in: [...UNCERTAIN_STATUSES] }, reviewedAt: null },
        data: { reviewedById: user.id, reviewedAt: new Date() },
      });
      await tx.submission.update({ where: { id: submissionId }, data: { nameMismatch: false } });
      await this.scoring.rescoreSubmission(tx, submissionId);
      await this.audit.log(
        { actorId: user.id, action: 'submission.confirm', entity: 'submission', entityId: submissionId, after: { confirmed: res.count } },
        tx,
      );
    });
    return this.submissions.detail(user, submissionId);
  }

  /** Sửa mã đề khi AI không đọc được hoặc đọc sai */
  async setVersionCode(user: AuthUser, submissionId: string, versionCode: string, ifMatch: number) {
    const sub = await this.load(user, submissionId, ifMatch);
    const exists = await this.prisma.answerKey.findUnique({
      where: { examId_versionCode: { examId: sub.examId, versionCode } },
    });
    if (!exists) throw new BadRequestException(`Bài kiểm tra không có đáp án mã đề ${versionCode || 'chung'}`);
    await this.prisma.$transaction(async (tx) => {
      await this.bumpVersion(tx, submissionId, ifMatch);
      await tx.submission.update({ where: { id: submissionId }, data: { versionCode } });
      await this.scoring.rescoreSubmission(tx, submissionId);
      await this.audit.log(
        { actorId: user.id, action: 'submission.version-code', entity: 'submission', entityId: submissionId, before: { versionCode: sub.versionCode }, after: { versionCode } },
        tx,
      );
    });
    return this.submissions.detail(user, submissionId);
  }

  private async load(user: AuthUser, submissionId: string, ifMatch: number) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId }, include: { exam: true } });
    if (!sub) throw new NotFoundException('Không tìm thấy bài nộp');
    await this.access.assertExam(user, sub.examId);
    if (sub.status !== 'GRADED' && sub.status !== 'NEEDS_REVIEW') {
      throw new ConflictException('Bài chưa chấm xong, chưa duyệt được');
    }
    if (sub.version !== ifMatch) {
      throw new PreconditionFailedException('Bài này vừa được người khác sửa. Tải lại để xem bản mới nhất');
    }
    return sub;
  }

  private async bumpVersion(tx: Prisma.TransactionClient, id: string, ifMatch: number) {
    const res = await tx.submission.updateMany({ where: { id, version: ifMatch }, data: { version: { increment: 1 } } });
    if (res.count === 0) {
      throw new PreconditionFailedException('Bài này vừa được người khác sửa. Tải lại để xem bản mới nhất');
    }
  }
}
