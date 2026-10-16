import type { Choice, ExtractedAnswer, ExtractedSheet } from './types';

/**
 * Code vẫn kiểm tra lại kết quả AI: đủ câu từ 1 đến N, không trùng câu,
 * lựa chọn nằm trong bộ lựa chọn của bài, trạng thái khớp với lựa chọn.
 * Câu nào không hợp lệ thì chuyển thành "unclear" để người duyệt.
 * Câu điền từ lấy "text", bỏ qua "choice".
 */
export function normalizeSheet(
  sheet: ExtractedSheet,
  questionCount: number,
  options: Choice[],
  textQuestions: number[] = [],
): ExtractedSheet {
  const isText = new Set(textQuestions);
  const byQ = new Map<number, ExtractedAnswer[]>();
  for (const a of sheet.answers) {
    if (!Number.isInteger(a.q) || a.q < 1 || a.q > questionCount) continue;
    const list = byQ.get(a.q) ?? [];
    list.push(a);
    byQ.set(a.q, list);
  }

  const answers: ExtractedAnswer[] = [];
  for (let q = 1; q <= questionCount; q++) {
    const empty: ExtractedAnswer = isText.has(q) ? { q, choice: null, text: null, status: 'unclear' } : { q, choice: null, status: 'unclear' };
    const found = byQ.get(q);
    if (!found || found.length === 0) {
      answers.push(empty);
      continue;
    }
    if (found.length > 1) {
      const same = found.every(
        (f) => f.choice === found[0].choice && (f.text ?? null) === (found[0].text ?? null) && f.status === found[0].status,
      );
      if (!same) {
        answers.push(empty);
        continue;
      }
    }
    answers.push(isText.has(q) ? normalizeTextAnswer(found[0]) : normalizeAnswer(found[0], options));
  }

  return {
    studentNameRead: cleanText(sheet.studentNameRead),
    versionCodeRead: cleanText(sheet.versionCodeRead),
    answers,
  };
}

/** Câu trắc nghiệm trả chữ cái, câu điền từ trả chữ học sinh viết */
export function answerValue(a: ExtractedAnswer): string | null {
  return a.text ?? a.choice ?? null;
}

function normalizeAnswer(a: ExtractedAnswer, options: Choice[]): ExtractedAnswer {
  const choice = a.choice && options.includes(a.choice) ? a.choice : null;
  if (a.choice && !choice) return { q: a.q, choice: null, status: 'unclear' };
  switch (a.status) {
    case 'clear':
      return choice ? { q: a.q, choice, status: 'clear' } : { q: a.q, choice: null, status: 'unclear' };
    case 'blank':
      return choice ? { q: a.q, choice, status: 'unclear' } : { q: a.q, choice: null, status: 'blank' };
    case 'multiple':
      return { q: a.q, choice: null, status: 'multiple' };
    default:
      return { q: a.q, choice, status: 'unclear' };
  }
}

function normalizeTextAnswer(a: ExtractedAnswer): ExtractedAnswer {
  const text = cleanText(a.text ?? null);
  switch (a.status) {
    case 'clear':
      return text ? { q: a.q, choice: null, text, status: 'clear' } : { q: a.q, choice: null, text: null, status: 'unclear' };
    case 'blank':
      return text ? { q: a.q, choice: null, text, status: 'unclear' } : { q: a.q, choice: null, text: null, status: 'blank' };
    case 'multiple':
      return { q: a.q, choice: null, text: null, status: 'multiple' };
    default:
      return { q: a.q, choice: null, text, status: 'unclear' };
  }
}

function cleanText(value: string | null): string | null {
  if (value == null) return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length === 0 ? null : t;
}
