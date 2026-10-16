import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UNCERTAIN_STATUSES, type MarkStatus, type QuestionKind } from '@missngoc/core';
import { scoreSubmission } from '../scoring';

type Tx = Prisma.TransactionClient;

interface KeyLike {
  versionCode: string;
  items: { questionNo: number; kind: QuestionKind; correct: string[]; points: Prisma.Decimal }[];
}

/** Bài chỉ có 1 bộ đáp án thì dùng bộ đó; nhiều mã đề thì phải biết mã đề của bài. */
export function resolveVersion(versionCode: string | null, keys: { versionCode: string }[]): string | null {
  if (keys.length === 1) return keys[0].versionCode;
  if (versionCode !== null && keys.some((k) => k.versionCode === versionCode)) return versionCode;
  return null;
}

/**
 * Tính lại điểm từ final_choice và đáp án. Không gọi AI, chạy lại bất cứ lúc nào:
 * sau khi chấm, sau khi duyệt sửa câu, sau khi sửa đáp án (UC-13).
 */
@Injectable()
export class ScoringService {
  async rescoreSubmission(tx: Tx, submissionId: string, keys?: KeyLike[]): Promise<void> {
    const sub = await tx.submission.findUnique({
      where: { id: submissionId },
      include: { answers: true },
    });
    if (!sub || sub.answers.length === 0) return;
    const answerKeys =
      keys ??
      (await tx.answerKey.findMany({ where: { examId: sub.examId }, include: { items: true } }));

    const versionCode = resolveVersion(sub.versionCode, answerKeys);
    const key = answerKeys.find((k) => k.versionCode === versionCode);

    if (!key) {
      await tx.result.deleteMany({ where: { submissionId } });
      await tx.submissionAnswer.updateMany({ where: { submissionId }, data: { isCorrect: null } });
    } else {
      const result = scoreSubmission(
        sub.answers.map((a) => ({ q: a.questionNo, finalChoice: a.finalChoice })),
        key.items.map((i) => ({ q: i.questionNo, kind: i.kind, correct: i.correct, points: Number(i.points) })),
      );
      const correctQs = result.perQuestion.filter((p) => p.isCorrect).map((p) => p.q);
      await tx.submissionAnswer.updateMany({
        where: { submissionId, questionNo: { in: correctQs } },
        data: { isCorrect: true },
      });
      await tx.submissionAnswer.updateMany({
        where: { submissionId, questionNo: { notIn: correctQs } },
        data: { isCorrect: false },
      });
      await tx.result.upsert({
        where: { submissionId },
        create: { submissionId, correctCount: result.correctCount, score: result.score },
        update: { correctCount: result.correctCount, score: result.score, gradedAt: new Date() },
      });
    }

    if (sub.status === 'GRADED' || sub.status === 'NEEDS_REVIEW') {
      const unresolved = sub.answers.some(
        (a) => UNCERTAIN_STATUSES.includes(a.status as MarkStatus) && a.reviewedAt === null,
      );
      const needsReview = unresolved || sub.nameMismatch || !key;
      const status = needsReview ? 'NEEDS_REVIEW' : 'GRADED';
      if (status !== sub.status) await tx.submission.update({ where: { id: submissionId }, data: { status } });
    }
  }

  async rescoreExam(tx: Tx, examId: string): Promise<number> {
    const keys = await tx.answerKey.findMany({ where: { examId }, include: { items: true } });
    const subs = await tx.submission.findMany({
      where: { examId, answers: { some: {} } },
      select: { id: true },
    });
    for (const s of subs) await this.rescoreSubmission(tx, s.id, keys);
    return subs.length;
  }
}
