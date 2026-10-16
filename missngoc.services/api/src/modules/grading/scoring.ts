import { normalizeTextAnswer, QUESTION_KIND_LABEL, type Choice, type QuestionKind } from '@missngoc/core';

export interface KeyItem {
  q: number;
  kind?: QuestionKind; // không ghi thì là trắc nghiệm
  correct: string[];
  points: number;
}

export interface FinalAnswer {
  q: number;
  finalChoice: Choice | string | null;
}

export interface ScoredQuestion {
  q: number;
  points: number;
  isCorrect: boolean;
}

export interface ScoreResult {
  correctCount: number;
  score: number;
  perQuestion: ScoredQuestion[];
}

// Hàm thuần, không gọi AI: chạy lại bất cứ lúc nào khi sửa đáp án hoặc sửa câu
export function scoreSubmission(answers: FinalAnswer[], key: KeyItem[]): ScoreResult {
  const byQ = new Map(answers.map((a) => [a.q, a.finalChoice]));
  const perQuestion = key.map((k) => {
    const chosen = byQ.get(k.q) ?? null;
    return { q: k.q, points: k.points, isCorrect: isAnswerCorrect(k, chosen) };
  });
  const correctCount = perQuestion.filter((p) => p.isCorrect).length;
  const raw = perQuestion.reduce((s, p) => s + (p.isCorrect ? p.points : 0), 0);
  return { correctCount, score: roundScore(raw), perQuestion };
}

/** Trắc nghiệm so đúng chữ cái. Điền từ so sau khi bỏ hoa/thường, khoảng trắng, dấu câu cuối; sai chính tả vẫn là sai. */
export function isAnswerCorrect(item: Pick<KeyItem, 'kind' | 'correct'>, chosen: string | null): boolean {
  if (chosen === null) return false;
  if (item.kind === 'text') {
    const got = normalizeTextAnswer(chosen);
    return got !== '' && item.correct.some((c) => normalizeTextAnswer(c) === got);
  }
  return item.correct.includes(chosen);
}

/** Làm tròn 2 chữ số, tránh lỗi số thực kiểu 0.1 + 0.2 */
export function roundScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Điểm mỗi câu khi file đáp án không ghi điểm: chia đều thang điểm */
export function defaultPoints(maxScore: number, questionCount: number): number {
  return Math.round((maxScore / questionCount) * 1000) / 1000;
}

/** Kiểm tra bộ đáp án đủ câu 1..N, không trùng. Trả về danh sách câu thiếu. */
export function missingQuestions(items: { q: number }[], questionCount: number): number[] {
  const have = new Set(items.map((i) => i.q));
  const missing: number[] = [];
  for (let q = 1; q <= questionCount; q++) if (!have.has(q)) missing.push(q);
  return missing;
}

/** Các mã đề của một bài phải cùng loại câu, vì AI đọc bài trước khi biết bài thuộc mã đề nào */
export function kindConflicts(keys: { versionCode: string; items: { q: number; kind: QuestionKind }[] }[]): string[] {
  const first = new Map<number, { kind: QuestionKind; versionCode: string }>();
  const reported = new Set<number>();
  const out: string[] = [];
  for (const k of keys) {
    for (const it of k.items) {
      const prev = first.get(it.q);
      if (!prev) first.set(it.q, { kind: it.kind, versionCode: k.versionCode });
      else if (prev.kind !== it.kind && !reported.has(it.q)) {
        reported.add(it.q);
        out.push(
          `Câu ${it.q} là câu ${QUESTION_KIND_LABEL[prev.kind].toLowerCase()} ở mã đề ${prev.versionCode || 'chung'} ` +
            `nhưng là câu ${QUESTION_KIND_LABEL[it.kind].toLowerCase()} ở mã đề ${k.versionCode || 'chung'}`,
        );
      }
    }
  }
  return out;
}
