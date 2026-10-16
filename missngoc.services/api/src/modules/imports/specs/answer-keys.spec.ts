import { parseKeyAnswer, type KeyAnswer } from '@missngoc/core';
import type { ImportContext, ImportSpec } from '../import-spec';
import { cellToString } from '../workbook';

export interface AnswerKeyImportRow {
  versionCode: string | null;
  q: number;
  answer: KeyAnswer;
  points: number | null;
}

function optionRange(ctx: ImportContext): string {
  const opts = ctx.options ?? 'ABCD';
  return `${opts[0]}–${opts[opts.length - 1]}`;
}

function versionLabel(ctx: ImportContext): string {
  const codes = (ctx.versionCodes ?? []).filter(Boolean);
  return codes.length > 0 ? `mã đề ${codes.join(' và ')}` : 'các mã đề trên đề thi';
}

export const answerKeysImportSpec: ImportSpec = {
  type: 'answer-keys',
  title: 'Đáp án',
  rowNoun: 'câu của một mã đề',
  maxRows: 1000,
  contextLines: (ctx) => {
    const n = ctx.questionCount ?? 0;
    return [
      `Bài kiểm tra ${ctx.examTitle ? `"${ctx.examTitle}" ` : ''}có ${n} câu, lựa chọn ${optionRange(ctx)}, ${versionLabel(ctx)}.`,
      `Mỗi mã đề phải đủ câu 1–${n}. Bài chỉ có một mã đề thì để trống cột Mã đề.`,
      `Chỉ lấy câu 1–${n}. Bỏ qua các phần khác của đáp án như viết lại câu, bài viết.`,
    ];
  },
  rules: (ctx) => [
    'Dòng 1 là tiêu đề, giữ nguyên tên cột như file mẫu',
    'Mỗi câu của một mã đề là một dòng',
    `Mỗi mã đề phải đủ câu từ 1 đến ${ctx.questionCount ?? 'N'}, không trùng câu`,
    'Bài chỉ có một mã đề thì để trống cả cột Mã đề',
    'Câu trắc nghiệm ghi chữ cái. Câu điền từ ghi nguyên từ hoặc cụm từ, nhiều cách viết đúng thì ngăn bằng dấu /',
    'Nhập lại đáp án của một mã đề thì ghi đè đáp án cũ của mã đề đó',
  ],
  columns: [
    {
      key: 'versionCode',
      header: 'Mã đề',
      aliases: ['Đề', 'Mã đề thi'],
      required: false,
      format: () => 'Văn bản. Bắt buộc nếu bài có nhiều mã đề',
      promptHint: () => 'Bài chỉ có một mã đề thì để trống.',
      examples: () => ['101', '101'],
      text: true,
      width: 10,
      parse: (raw) => {
        const v = cellToString(raw).toUpperCase();
        if (!/^[A-Z0-9-]{1,10}$/.test(v)) return { error: 'Mã đề gồm chữ, số, tối đa 10 ký tự' };
        return { value: v };
      },
    },
    {
      key: 'q',
      header: 'Câu',
      aliases: ['Câu số', 'Số câu', 'STT', 'Q'],
      required: true,
      format: (ctx) => `Số từ 1 đến ${ctx.questionCount ?? 'số câu của bài'}`,
      promptHint: (ctx) => `Số thứ tự câu, từ 1 đến ${ctx.questionCount ?? 'N'}.`,
      examples: () => ['1', '2'],
      width: 8,
      parse: (raw, ctx) => {
        const n = typeof raw === 'number' ? raw : Number(cellToString(raw).replace(/^(câu|cau)\s*/i, ''));
        if (!Number.isInteger(n) || n < 1 || n > (ctx.questionCount ?? 1000)) {
          return { error: `Phải là số nguyên từ 1 đến ${ctx.questionCount}` };
        }
        return { value: n };
      },
    },
    {
      key: 'answer',
      header: 'Đáp án',
      aliases: ['Đáp án đúng', 'Answer', 'Key'],
      required: true,
      format: (ctx) =>
        `Trắc nghiệm: một chữ trong ${optionRange(ctx)}, nhiều đáp án đúng thì ngăn bằng dấu phẩy (A,C). ` +
        'Điền từ: ghi nguyên từ, nhiều cách viết đúng thì ngăn bằng dấu /',
      promptHint: (ctx) =>
        `Câu trắc nghiệm: một chữ in hoa trong ${optionRange(ctx)}; câu có nhiều đáp án đúng thì ngăn bằng dấu phẩy, ví dụ A,C. ` +
        'Câu điền từ: chép đúng từ hoặc cụm từ trong đáp án, giữ nguyên chính tả, ví dụ eight hours; ' +
        'nhiều cách viết được chấp nhận thì ngăn bằng dấu /, ví dụ eight hours / 8 hours.',
      examples: () => ['B', 'eight hours / 8 hours'],
      width: 22,
      parse: (raw, ctx) => {
        const res = parseKeyAnswer(cellToString(raw), ctx.options ?? 'ABCDE');
        return 'error' in res ? { error: res.error } : { value: res };
      },
    },
    {
      key: 'points',
      header: 'Điểm',
      aliases: ['Điểm câu', 'Points'],
      required: false,
      format: () => 'Số. Trống thì chia đều thang điểm',
      promptHint: () => 'Để trống nếu các câu có điểm bằng nhau.',
      examples: () => ['0.25', ''],
      width: 8,
      parse: (raw) => {
        const n = typeof raw === 'number' ? raw : Number(cellToString(raw).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'Phải là số từ 0 đến 100' };
        return { value: n };
      },
    },
  ],
};
