import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type PgBoss from 'pg-boss';
import type { Choice } from '@missngoc/core';
import { StorageService } from '../../../common/storage/storage.service';
import { namesLikelyMatch } from '../../../common/text';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueueService, type GradeJobData } from '../../../queue/queue.service';
import { createExtractor } from '../engines/engine.factory';
import { answerValue, normalizeSheet } from '../engines/normalize';
import { PROMPT_VERSION } from '../engines/prompt';
import { NonRetryableExtractionError, type AnswerExtractor } from '../engines/types';
import { ScoringService } from './scoring.service';

/**
 * Worker đọc ảnh và chấm. Chạy trong tiến trình worker (APP_ROLE=worker),
 * hoặc ngay trong tiến trình api khi WORKER_IN_PROCESS=true (tiện cho máy dev).
 */
@Injectable()
export class GradingProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(GradingProcessor.name);
  private extractor?: AnswerExtractor;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
    private readonly scoring: ScoringService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const enabled = process.env.APP_ROLE === 'worker' || this.config.get('WORKER_IN_PROCESS') === 'true';
    if (!enabled) return;
    const concurrency = Number(this.config.get('GRADING_CONCURRENCY', 5)) || 5;
    this.logger.log(`Worker chấm bài: engine ${this.config.get('GRADING_ENGINE', 'mock')}, ${concurrency} job song song`);
    await this.queue.workGrade(concurrency, (job) => this.handle(job));
  }

  private getExtractor(): AnswerExtractor {
    this.extractor ??= createExtractor(this.config.get('GRADING_ENGINE'));
    return this.extractor;
  }

  async handle(job: PgBoss.JobWithMetadata<GradeJobData>): Promise<void> {
    const { submissionId } = job.data;
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        images: { orderBy: { pageNo: 'asc' } },
        student: true,
        exam: { include: { answerKeys: { include: { items: true } } } },
      },
    });
    // Bài đã đổi trạng thái trong lúc chờ (xoá ảnh, chuyển ảnh, đánh vắng) thì bỏ qua
    if (!sub || (sub.status !== 'QUEUED' && sub.status !== 'PROCESSING')) return;
    if (sub.images.length === 0) {
      await this.prisma.submission.update({ where: { id: sub.id }, data: { status: 'NO_IMAGE' } });
      return;
    }

    await this.prisma.submission.update({ where: { id: sub.id }, data: { status: 'PROCESSING' } });

    let extractor: AnswerExtractor;
    try {
      extractor = this.getExtractor();
    } catch (err) {
      await this.fail(sub.id, (err as Error).message);
      return;
    }

    const { exam } = sub;
    const options = exam.options.split('') as Choice[];
    // Các mã đề cùng loại câu (kiểm tra lúc lưu đáp án), nên gộp lại là đủ
    const textQuestions = [
      ...new Set(exam.answerKeys.flatMap((k) => k.items.filter((i) => i.kind === 'text').map((i) => i.questionNo))),
    ].sort((a, b) => a - b);
    const started = Date.now();
    let result;
    try {
      const images = await Promise.all(
        sub.images.map(async (img) => ({ data: await this.storage.read(img.filePath), mimeType: img.mimeType })),
      );
      result = await extractor.extract({
        images,
        questionCount: exam.questionCount,
        options,
        layoutHint: exam.layoutHint,
        textQuestions,
        versionCodes: exam.answerKeys.map((k) => k.versionCode),
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const lastAttempt = job.retryCount >= job.retryLimit;
      if (err instanceof NonRetryableExtractionError || lastAttempt) {
        this.logger.warn(`Bài ${sub.id} lỗi: ${message}`);
        await this.fail(sub.id, message);
        return;
      }
      await this.prisma.submission.update({
        where: { id: sub.id },
        data: { status: 'QUEUED', lastError: `Đang thử lại (lần ${job.retryCount + 1}): ${message}` },
      });
      throw err; // pg-boss thử lại, giãn cách tăng dần
    }

    const sheet = normalizeSheet(result.sheet, exam.questionCount, options, textQuestions);
    const keys = exam.answerKeys;
    let versionCode = sub.versionCode;
    if (keys.length > 1) {
      const read = sheet.versionCodeRead?.toUpperCase().replace(/\s+/g, '') ?? null;
      if (read && keys.some((k) => k.versionCode === read)) versionCode = read;
    }
    const nameMismatch = !namesLikelyMatch(sheet.studentNameRead, sub.student.fullName);

    await this.prisma.$transaction(async (tx) => {
      await tx.extraction.create({
        data: {
          submissionId: sub.id,
          engine: result.engine ?? extractor.name,
          model: result.model,
          promptVersion: PROMPT_VERSION,
          rawJson: JSON.parse(JSON.stringify(result.raw)),
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
          durationMs: Date.now() - started,
        },
      });
      await tx.submissionAnswer.deleteMany({ where: { submissionId: sub.id } });
      await tx.submissionAnswer.createMany({
        data: sheet.answers.map((a) => ({
          submissionId: sub.id,
          questionNo: a.q,
          detectedChoice: answerValue(a),
          status: a.status,
          // Câu không chắc vẫn giữ lựa chọn AI đoán để người duyệt xác nhận; tô 2 ô thì không tính
          finalChoice: a.status === 'multiple' ? null : answerValue(a),
        })),
      });
      await tx.submission.update({
        where: { id: sub.id },
        data: {
          status: 'NEEDS_REVIEW',
          versionCode,
          studentNameRead: sheet.studentNameRead,
          nameMismatch,
          lastError: null,
        },
      });
      await this.scoring.rescoreSubmission(tx, sub.id, keys);
    });
  }

  private async fail(submissionId: string, message: string) {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'FAILED', lastError: message.slice(0, 500) },
    });
  }
}
