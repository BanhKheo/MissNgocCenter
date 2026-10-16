import type { ExtractInput } from './types';

// Lời nhắc có số phiên bản. Mỗi lần đổi lời nhắc hoặc đổi model thì chạy lại bộ bài PoC để so sánh.
export const PROMPT_VERSION = '2026-10-16.2';

/** [5, 6, 7, 8, 18, 19] → "5-8, 18-19" */
export function formatQuestionRanges(questions: number[]): string {
  const sorted = [...new Set(questions)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return parts.join(', ');
}

// Không gửi đáp án lên AI: AI chỉ báo học sinh chọn gì, viết gì; code mới so với đáp án.
export function buildPrompt(input: ExtractInput): string {
  const optionList = input.options.join(', ');
  const textQuestions = (input.textQuestions ?? []).filter((q) => q >= 1 && q <= input.questionCount);
  const hasText = textQuestions.length > 0;
  const lines = [
    hasText
      ? 'You are reading photographs of an English test from an English language centre in Vietnam. The student answered on the paper.'
      : 'You are reading a photographed multiple-choice answer sheet from an English language centre in Vietnam.',
    'Report ONLY what the student marked or wrote. Do not guess the correct answer and do not correct the student.',
    '',
    'Sheet layout:',
    `- Questions are numbered 1 to ${input.questionCount}.`,
  ];
  if (hasText) {
    lines.push(
      `- Fill-in questions: ${formatQuestionRanges(textQuestions)}. The student wrote a word or a short phrase by hand.`,
      `- Every other question is multiple choice with these options: ${optionList}.`,
    );
  } else {
    lines.push(`- Each question has these options: ${optionList}.`);
  }
  if (input.layoutHint) lines.push(`- Layout hint from the teacher: ${input.layoutHint}`);
  if (input.images.length > 1) {
    lines.push(`- The sheet spans ${input.images.length} photos, in page order. Read all of them.`);
  }
  lines.push(
    '- For multiple choice, the student may fill a bubble, circle a letter, tick, or write the letter next to the question number.',
    '',
    'For every question from 1 to ' + input.questionCount + ', return one entry with:',
    '- "q": the question number.',
    `- "choice": the single option the student chose (${optionList}), or null.` +
      (hasText ? ' Always null for a fill-in question.' : ''),
    hasText
      ? '- "text": for a fill-in question, the word or phrase the student wrote, copied exactly, or null. Always null for a multiple-choice question.'
      : '- "text": always null.',
    '- "status":',
    '  - "clear": exactly one option is clearly marked, or every letter of the written answer is legible.',
    '  - "blank": nothing is marked or written. "choice" and "text" are null.',
    '  - "multiple": two or more options are marked equally strongly, or two different answers are written and neither is crossed out. "choice" and "text" are null.',
    '  - "unclear": a mark or a letter is faint, crossed out, partly erased, ambiguous, outside the photo, or you are not sure which question it belongs to. Put your best reading in "choice" or "text", or null.',
    '',
    'Rules:',
    '- If a mark is crossed out and another option is marked instead, the remaining mark is the answer; use "clear" only if that is unambiguous.',
    '- Be careful not to shift rows: check that each mark lines up with its own question number. If alignment is uncertain, use "unclear".',
    '- When in doubt between "clear" and "unclear", choose "unclear". A wrong "clear" is much worse than an extra "unclear".',
  );
  if (hasText) {
    lines.push(
      '- Fill-in answers: copy the handwriting letter by letter, exactly as written. Keep spelling mistakes, missing or extra letters and wrong word forms. Never fix spelling or grammar, never complete a word, and never replace it with the word the question seems to expect. Spelling is what is being graded.',
      '- Fill-in answers: copy only what the student wrote by hand, not the printed text of the test. If the student crossed out a word and wrote another, copy only the word that is not crossed out.',
    );
  }
  lines.push(
    '- Return exactly ' + input.questionCount + ' entries, ordered by "q", with no duplicates.',
    '',
    'Also return:',
    '- "studentNameRead": the student name written on the sheet, exactly as written (Vietnamese with diacritics if legible), or null.',
  );
  if (input.versionCodes && input.versionCodes.filter(Boolean).length > 0) {
    lines.push(
      `- "versionCodeRead": the exam version code (mã đề) written on the sheet, or null. Known codes: ${input.versionCodes
        .filter(Boolean)
        .join(', ')}.`,
    );
  } else {
    lines.push('- "versionCodeRead": the exam version code (mã đề) written on the sheet, or null.');
  }
  return lines.join('\n');
}
