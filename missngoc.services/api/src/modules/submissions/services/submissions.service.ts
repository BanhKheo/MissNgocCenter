import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { UNCERTAIN_STATUSES, type MarkStatus, type SubmissionStatus } from '@missngoc/core';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { ImageRejectedError, MAX_UPLOAD_BYTES, normalizeImage } from '../../../common/images';
import { StorageService } from '../../../common/storage/storage.service';
import { compareVietnameseNames } from '../../../common/text';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

const BUSY: SubmissionStatus[] = ['QUEUED', 'PROCESSING'];

export interface SubmissionRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  inClass: boolean;
  submissionId: string | null;
  status: SubmissionStatus;
  imageCount: number;
  versionCode: string | null;
  score: number | null;
  correctCount: number | null;
  uncertainCount: number;
  nameMismatch: boolean;
  lastError: string | null;
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Học sinh của lớp kèm trạng thái bài (FR-CAP-03). Có cả học sinh đã rời lớp nhưng đã nộp bài. */
  async listForExam(user: AuthUser, examId: string): Promise<SubmissionRow[]> {
    const exam = await this.access.assertExam(user, examId);
    return this.rows(exam);
  }

  private async rows(exam: { id: string; classId: string }): Promise<SubmissionRow[]> {
    const examId = exam.id;
    const [enrollments, subs] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { classId: exam.classId, leftAt: null }, include: { student: true } }),
      this.prisma.submission.findMany({
        where: { examId },
        include: {
          student: true,
          result: true,
          _count: { select: { images: true } },
          answers: { where: { status: { in: [...UNCERTAIN_STATUSES] }, reviewedAt: null }, select: { questionNo: true } },
        },
      }),
    ]);
    const bySid = new Map(subs.map((s) => [s.studentId, s]));
    const enrolledIds = new Set(enrollments.map((e) => e.studentId));
    const students = [
      ...enrollments.map((e) => e.student),
      ...subs.filter((s) => !enrolledIds.has(s.studentId)).map((s) => s.student),
    ];
    return students
      .map((st) => {
        const s = bySid.get(st.id);
        return {
          studentId: st.id,
          studentCode: st.studentCode,
          fullName: st.fullName,
          inClass: enrolledIds.has(st.id),
          submissionId: s?.id ?? null,
          status: (s?.status ?? 'NO_IMAGE') as SubmissionStatus,
          imageCount: s?._count.images ?? 0,
          versionCode: s?.versionCode ?? null,
          score: s?.result ? Number(s.result.score) : null,
          correctCount: s?.result?.correctCount ?? null,
          uncertainCount: s?.answers.length ?? 0,
          nameMismatch: s?.nameMismatch ?? false,
          lastError: s?.lastError ?? null,
        };
      })
      .sort((a, b) => compareVietnameseNames(a.fullName, b.fullName));
  }

  async detail(user: AuthUser, submissionId: string) {
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        student: true,
        result: true,
        images: { orderBy: { pageNo: 'asc' } },
        answers: { orderBy: { questionNo: 'asc' } },
        exam: {
          include: {
            class: true,
            answerKeys: { select: { versionCode: true, items: { select: { questionNo: true, kind: true } } } },
          },
        },
      },
    });
    if (!sub) throw new NotFoundException('Không tìm thấy bài nộp');
    await this.access.assertExam(user, sub.examId);
    const kindOf = new Map(sub.exam.answerKeys.flatMap((k) => k.items.map((i) => [i.questionNo, i.kind] as const)));
    return {
      id: sub.id,
      status: sub.status,
      version: sub.version,
      versionCode: sub.versionCode,
      studentNameRead: sub.studentNameRead,
      nameMismatch: sub.nameMismatch,
      lastError: sub.lastError,
      student: { id: sub.student.id, studentCode: sub.student.studentCode, fullName: sub.student.fullName },
      exam: {
        id: sub.exam.id,
        title: sub.exam.title,
        questionCount: sub.exam.questionCount,
        options: sub.exam.options,
        maxScore: Number(sub.exam.maxScore),
        className: sub.exam.class.name,
        versionCodes: sub.exam.answerKeys.map((k) => k.versionCode).sort(),
      },
      images: sub.images.map((i) => ({ id: i.id, pageNo: i.pageNo, uploadedAt: i.uploadedAt })),
      answers: sub.answers.map((a) => ({
        q: a.questionNo,
        kind: kindOf.get(a.questionNo) ?? 'choice',
        detectedChoice: a.detectedChoice,
        status: a.status,
        finalChoice: a.finalChoice,
        isCorrect: a.isCorrect,
        reviewed: a.reviewedAt !== null,
        needsReview: UNCERTAIN_STATUSES.includes(a.status as MarkStatus) && a.reviewedAt === null,
      })),
      result: sub.result ? { score: Number(sub.result.score), correctCount: sub.result.correctCount } : null,
    };
  }

  /** Tải 1 ảnh (1 trang) cho bài của học sinh. Ảnh được xoay theo EXIF và nén lại trước khi lưu. */
  async uploadImage(user: AuthUser, examId: string, studentId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Chưa có ảnh');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Ảnh quá lớn, tối đa 15 MB');
    const exam = await this.access.assertExam(user, examId);
    if (exam.status !== 'OPEN') throw new BadRequestException('Bài kiểm tra đã lưu trữ');
    const enrolled = await this.prisma.enrollment.findFirst({ where: { classId: exam.classId, studentId } });
    if (!enrolled) throw new BadRequestException('Học sinh không thuộc lớp của bài kiểm tra này');

    let image;
    try {
      image = await normalizeImage(file.buffer);
    } catch (err) {
      if (err instanceof ImageRejectedError) throw new BadRequestException(err.message);
      throw err;
    }
    const sha256 = createHash('sha256').update(image.data).digest('hex');

    const dup = await this.prisma.submissionImage.findFirst({
      where: { sha256, submission: { examId } },
      include: { submission: { include: { student: true } } },
    });
    if (dup) {
      const who = dup.submission.studentId === studentId ? 'học sinh này' : dup.submission.student.fullName;
      throw new ConflictException(`Ảnh này đã tải lên cho ${who}`);
    }

    const sub = await this.prisma.submission.upsert({
      where: { examId_studentId: { examId, studentId } },
      create: { examId, studentId, status: 'NO_IMAGE' },
      update: {},
      include: { _count: { select: { images: true } } },
    });
    if (BUSY.includes(sub.status)) throw new ConflictException('Bài đang được chấm, chờ chấm xong rồi thêm ảnh');

    const filePath = await this.storage.saveImage(examId, sub.id, image.data);
    const last = await this.prisma.submissionImage.aggregate({ where: { submissionId: sub.id }, _max: { pageNo: true } });
    await this.prisma.$transaction([
      this.prisma.submissionImage.create({
        data: {
          submissionId: sub.id,
          filePath,
          mimeType: image.mimeType,
          sizeBytes: image.data.length,
          sha256,
          pageNo: (last._max.pageNo ?? 0) + 1,
          uploadedById: user.id,
        },
      }),
      // Thêm trang sau khi đã chấm thì cần chấm lại
      this.prisma.submission.update({ where: { id: sub.id }, data: { status: 'UPLOADED', lastError: null } }),
    ]);
    return this.row(examId, studentId);
  }

  async readImage(user: AuthUser, imageId: string) {
    const img = await this.prisma.submissionImage.findUnique({ where: { id: imageId }, include: { submission: true } });
    if (!img) throw new NotFoundException('Không tìm thấy ảnh');
    await this.access.assertExam(user, img.submission.examId);
    return { stream: this.storage.stream(img.filePath), mimeType: img.mimeType, size: img.sizeBytes };
  }

  async deleteImage(user: AuthUser, imageId: string) {
    const img = await this.prisma.submissionImage.findUnique({ where: { id: imageId }, include: { submission: true } });
    if (!img) throw new NotFoundException('Không tìm thấy ảnh');
    await this.access.assertExam(user, img.submission.examId);
    if (BUSY.includes(img.submission.status)) throw new ConflictException('Bài đang được chấm, chờ chấm xong rồi xoá ảnh');
    await this.prisma.$transaction(async (tx) => {
      await tx.submissionImage.delete({ where: { id: imageId } });
      await this.afterImagesChanged(tx, img.submissionId);
      await this.audit.log(
        { actorId: user.id, action: 'submission.image.delete', entity: 'submission', entityId: img.submissionId, before: { imageId, pageNo: img.pageNo } },
        tx,
      );
    });
    await this.storage.remove(img.filePath);
    return this.row(img.submission.examId, img.submission.studentId);
  }

  /** Gắn nhầm học sinh: chuyển ảnh sang em khác trong cùng bài kiểm tra (FR-CAP-09) */
  async moveImage(user: AuthUser, imageId: string, targetStudentId: string) {
    const img = await this.prisma.submissionImage.findUnique({ where: { id: imageId }, include: { submission: true } });
    if (!img) throw new NotFoundException('Không tìm thấy ảnh');
    const exam = await this.access.assertExam(user, img.submission.examId);
    if (img.submission.studentId === targetStudentId) throw new BadRequestException('Ảnh đang ở đúng học sinh này');
    const enrolled = await this.prisma.enrollment.findFirst({ where: { classId: exam.classId, studentId: targetStudentId } });
    if (!enrolled) throw new BadRequestException('Học sinh không thuộc lớp này');

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.submission.upsert({
        where: { examId_studentId: { examId: exam.id, studentId: targetStudentId } },
        create: { examId: exam.id, studentId: targetStudentId, status: 'NO_IMAGE' },
        update: {},
      });
      if (BUSY.includes(target.status) || BUSY.includes(img.submission.status)) {
        throw new ConflictException('Bài đang được chấm, chờ chấm xong rồi chuyển ảnh');
      }
      const last = await tx.submissionImage.aggregate({ where: { submissionId: target.id }, _max: { pageNo: true } });
      await tx.submissionImage.update({
        where: { id: imageId },
        data: { submissionId: target.id, pageNo: (last._max.pageNo ?? 0) + 1 },
      });
      await tx.submission.update({ where: { id: target.id }, data: { status: 'UPLOADED', lastError: null } });
      await this.afterImagesChanged(tx, img.submissionId);
      await this.audit.log(
        { actorId: user.id, action: 'submission.image.move', entity: 'submission', entityId: img.submissionId, after: { imageId, toSubmission: target.id } },
        tx,
      );
    });
    return this.listForExam(user, exam.id);
  }

  /** Đánh dấu vắng (FR-CAP-08). Bài vắng không đưa vào Generate. */
  async setAbsent(user: AuthUser, examId: string, studentId: string, absent: boolean) {
    const exam = await this.access.assertExam(user, examId);
    const enrolled = await this.prisma.enrollment.findFirst({ where: { classId: exam.classId, studentId } });
    if (!enrolled) throw new BadRequestException('Học sinh không thuộc lớp này');
    const existing = await this.prisma.submission.findUnique({
      where: { examId_studentId: { examId, studentId } },
      include: { _count: { select: { images: true } } },
    });
    if (absent && existing && existing._count.images > 0) {
      throw new ConflictException('Học sinh đã có ảnh bài làm. Xoá ảnh trước khi đánh vắng');
    }
    await this.prisma.submission.upsert({
      where: { examId_studentId: { examId, studentId } },
      create: { examId, studentId, status: absent ? 'ABSENT' : 'NO_IMAGE' },
      update: { status: absent ? 'ABSENT' : 'NO_IMAGE' },
    });
    return this.row(examId, studentId);
  }

  private async row(examId: string, studentId: string) {
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId }, select: { id: true, classId: true } });
    const rows = await this.rows(exam);
    return rows.find((r) => r.studentId === studentId)!;
  }

  /** Sau khi xoá/chuyển ảnh: đánh số lại trang; hết ảnh thì xoá kết quả cũ */
  private async afterImagesChanged(tx: Prisma.TransactionClient, submissionId: string) {
    const images = await tx.submissionImage.findMany({ where: { submissionId }, orderBy: { pageNo: 'asc' } });
    for (const [i, img] of images.entries()) {
      if (img.pageNo !== i + 1) await tx.submissionImage.update({ where: { id: img.id }, data: { pageNo: i + 1 } });
    }
    if (images.length === 0) {
      await tx.submissionAnswer.deleteMany({ where: { submissionId } });
      await tx.result.deleteMany({ where: { submissionId } });
      await tx.submission.update({ where: { id: submissionId }, data: { status: 'NO_IMAGE', lastError: null, nameMismatch: false, studentNameRead: null } });
    } else {
      await tx.submission.update({ where: { id: submissionId }, data: { status: 'UPLOADED' } });
    }
  }
}
