import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PgBoss from 'pg-boss';

export const GRADE_QUEUE = 'grade-submission';

export interface GradeJobData {
  submissionId: string;
  runId: string;
  regrade: boolean;
}

/**
 * Hàng đợi pg-boss chạy luôn trên Postgres, không cần Redis.
 * Job nằm trong database nên api hay worker khởi động lại cũng không mất.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly boss: PgBoss;

  constructor(config: ConfigService) {
    this.boss = new PgBoss({ connectionString: config.getOrThrow<string>('DATABASE_URL') });
    this.boss.on('error', (err) => this.logger.error(err));
  }

  async onModuleInit() {
    await this.boss.start();
    // stately: mỗi bài nộp tối đa 1 job đang chờ và 1 job đang chạy
    await this.boss.createQueue(GRADE_QUEUE, {
      name: GRADE_QUEUE,
      policy: 'stately',
      retryLimit: 3,
      retryDelay: 20,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    });
  }

  async onModuleDestroy() {
    await this.boss.stop({ graceful: true, timeout: 20_000 });
  }

  async enqueueGrade(data: GradeJobData, singletonKey: string) {
    return this.boss.send(GRADE_QUEUE, data, { singletonKey });
  }

  async workGrade(
    concurrency: number,
    handler: (job: PgBoss.JobWithMetadata<GradeJobData>) => Promise<void>,
  ): Promise<void> {
    // Gọi work() nhiều lần để chạy song song nhiều job
    for (let i = 0; i < concurrency; i++) {
      await this.boss.work<GradeJobData>(
        GRADE_QUEUE,
        { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 2 },
        async ([job]) => handler(job),
      );
    }
  }
}
