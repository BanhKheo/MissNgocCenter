import { MAX_TEXT_ANSWER, type QuestionKind } from './domain';

export interface KeyAnswer {
  kind: QuestionKind;
  correct: string[];
}

const LETTER_LIST = /^[A-Za-z](\s*[,;/]\s*[A-Za-z])*$/;

/** "eight hours / 8 hours" hoặc "eight hours | 8 hours" → các cách viết được chấp nhận */
export function splitTextAnswers(value: string): string[] {
  const parts = value
    .split(/[/|]/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/**
 * Đọc một ô đáp án. Một chữ cái, hoặc vài chữ cái ngăn bằng dấu phẩy, là câu trắc nghiệm.
 * Còn lại là câu điền từ, nhiều cách viết đúng ngăn bằng dấu /.
 * Câu điền từ có đáp án đúng 1 chữ cái (ví dụ "a") thì đổi loại câu trên màn hình nhập đáp án.
 */
export function parseKeyAnswer(raw: string, options: string): KeyAnswer | { error: string } {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return { error: 'Đang để trống' };
  if (LETTER_LIST.test(s)) {
    const letters = [...new Set(s.toUpperCase().split(/[\s,;/]+/).filter(Boolean))].sort();
    const bad = letters.filter((l) => !options.includes(l));
    if (bad.length > 0) return { error: `"${bad.join(', ')}" không thuộc bộ lựa chọn ${options}` };
    return { kind: 'choice', correct: letters };
  }
  const texts = splitTextAnswers(s);
  if (texts.length === 0) return { error: 'Đang để trống' };
  if (texts.some((t) => t.length > MAX_TEXT_ANSWER)) return { error: `Mỗi đáp án điền từ tối đa ${MAX_TEXT_ANSWER} ký tự` };
  return { kind: 'text', correct: texts };
}

/**
 * Dạng để so khớp câu điền từ: bỏ khác biệt chữ hoa/thường, khoảng trắng thừa,
 * dấu câu ở cuối và kiểu dấu nháy. Không sửa chính tả: "creativty" vẫn khác "creativity".
 */
export function normalizeTextAnswer(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”"]/g, '')
    .toLowerCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,!?;:]+$/, '')
    .trim();
}
