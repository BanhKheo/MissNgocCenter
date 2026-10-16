import type { ImportContext, ImportSpec } from './import-spec';
import { isRequired } from './import-spec';

/**
 * Prompt để người dùng dán vào ChatGPT, Claude hoặc Gemini (FR-IMP-03, FR-IMP-04).
 * Chatbot tạo thẳng file .xlsx đúng mẫu để tải về rồi import; không tạo được file thì trả CSV.
 */
export function buildImportPrompt(spec: ImportSpec, ctx: ImportContext): string {
  const cols = spec.columns;
  const scope = ctx.className ?? ctx.examTitle;
  const fileName = `${spec.title}${scope ? ` - ${scope}` : ''}.xlsx`;
  const textCols = cols.filter((c) => c.text).map((c) => c.header);
  const lines = [
    'Bạn là trợ lý nhập liệu. Hãy chuyển dữ liệu tôi dán ở cuối thành MỘT file Excel (.xlsx) để tôi tải về rồi import vào phần mềm.',
    '',
  ];
  const context = spec.contextLines(ctx);
  if (context.length > 0) lines.push(...context, '');
  lines.push(`File có đúng ${cols.length} cột, theo thứ tự:`);
  cols.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.header}: ${isRequired(c, ctx) ? 'bắt buộc' : 'không bắt buộc'}. ${c.promptHint(ctx)}`);
  });
  lines.push(
    '',
    'Yêu cầu với file:',
    `- Tên file: ${fileName}`,
    '- Chỉ 1 sheet. Dòng 1 là tiêu đề, ghi đúng tên cột: ' + cols.map((c) => c.header).join(' | '),
    '- Không thêm tiêu đề, ghi chú hay dòng trống phía trên dòng tiêu đề.',
    `- Mỗi ${spec.rowNoun} một dòng. Không thêm cột, không gộp ô, không dùng công thức.`,
  );
  if (textCols.length > 0) {
    lines.push(`- Định dạng ô kiểu Text cho cột ${textCols.join(', ')}, để Excel không làm mất số 0 ở đầu hay tự đổi ngày.`);
  }
  lines.push(
    '- Không tự bịa thông tin. Thiếu thì để trống.',
    '- Dòng nào không chắc thì ghi trong câu trả lời, không ghi vào file, kèm lý do.',
    '- Nếu bạn không tạo được file, hãy trả về nội dung CSV (UTF-8, ngăn bằng dấu phẩy, ô có dấu phẩy thì đặt trong dấu ngoặc kép) trong một khối code để tôi lưu thành file .csv.',
    '',
    'Dữ liệu của tôi:',
    '<dán danh sách, hoặc đính kèm ảnh hay file ở đây>',
  );
  return lines.join('\n');
}
