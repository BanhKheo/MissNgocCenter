import type { CellValue, ImportSpec } from '../import-spec';
import { cellToString } from '../workbook';

export interface StudentImportRow {
  studentCode: string | null;
  fullName: string;
  dob: Date | null;
  parentPhone: string | null;
}

function titleCase(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1).toLocaleLowerCase('vi'))
    .join(' ');
}

export function parseDob(raw: CellValue): { value?: Date; error?: string } {
  let d: Date | null = null;
  if (raw instanceof Date) d = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  else if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Số ngày kiểu Excel (ô Date bị đọc thành số)
    d = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86_400_000);
  } else {
    const m = cellToString(raw).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) return { error: 'Không đúng dạng dd/mm/yyyy' };
    const [, dd, mm, yyyy] = m.map(Number);
    d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (d.getUTCDate() !== dd || d.getUTCMonth() !== mm - 1) return { error: 'Ngày không có thật' };
  }
  const year = d.getUTCFullYear();
  if (year < 1950 || d > new Date()) return { error: 'Năm sinh không hợp lý' };
  return { value: d };
}

export function parsePhone(raw: CellValue): { value?: string; error?: string } {
  let digits = cellToString(raw).replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('84') && digits.length === 11) digits = '0' + digits.slice(2);
  if (!/^\d+$/.test(digits)) return { error: 'Chỉ được có chữ số' };
  // Excel làm mất số 0 đầu khi ô là kiểu Number (FR-IMP-08)
  if (digits.length === 9 && !digits.startsWith('0')) digits = '0' + digits;
  if (!/^0\d{9}$/.test(digits)) return { error: 'Cần 10 chữ số, bắt đầu bằng 0' };
  return { value: digits };
}

export const studentsImportSpec: ImportSpec = {
  type: 'students',
  title: 'Danh sách học sinh',
  rowNoun: 'học sinh',
  maxRows: 1000,
  privacyNote:
    'Đây là dữ liệu cá nhân của học sinh. Chỉ dùng chatbot trung tâm cho phép, hoặc bỏ cột Ngày sinh và SĐT phụ huynh trước khi dán.',
  contextLines: (ctx) => (ctx.className ? [`Danh sách học sinh của lớp ${ctx.className}.`] : []),
  rules: () => [
    'Dòng 1 là tiêu đề, giữ nguyên tên cột như file mẫu',
    'Mỗi học sinh một dòng, không gộp ô',
    'Mã HS trùng với học sinh đã có thì cập nhật học sinh đó và thêm vào lớp',
  ],
  columns: [
    {
      key: 'studentCode',
      header: 'Mã HS',
      aliases: ['Mã học sinh', 'Mã số', 'Mã', 'MSHS'],
      required: false,
      format: () => 'Chữ và số. Trống thì hệ thống tự tạo. Trùng mã đã có thì cập nhật học sinh đó',
      promptHint: () => 'Giữ nguyên nếu dữ liệu có, không có thì để trống.',
      examples: () => ['HS0001', ''],
      text: true,
      width: 12,
      parse: (raw) => {
        const v = cellToString(raw).toUpperCase();
        if (!/^[A-Z0-9._-]{1,30}$/.test(v)) return { error: 'Chỉ gồm chữ không dấu, số, dấu chấm, gạch; tối đa 30 ký tự' };
        return { value: v };
      },
    },
    {
      key: 'fullName',
      header: 'Họ và tên',
      aliases: ['Họ tên', 'Tên', 'Họ và tên học sinh', 'Tên học sinh'],
      required: true,
      format: () => 'Có dấu tiếng Việt',
      promptHint: () => 'Viết hoa chữ cái đầu mỗi từ, giữ dấu tiếng Việt.',
      examples: () => ['Nguyễn Văn An', 'Trần Thị Bích Ngọc'],
      width: 28,
      parse: (raw) => {
        const v = titleCase(cellToString(raw));
        if (v.length < 2 || v.length > 100) return { error: 'Họ tên dài 2–100 ký tự' };
        if (/\d/.test(v)) return { error: 'Họ tên không được có chữ số' };
        return { value: v };
      },
    },
    {
      key: 'dob',
      header: 'Ngày sinh',
      aliases: ['NS', 'Sinh ngày'],
      required: false,
      format: () => 'dd/mm/yyyy, hoặc ô kiểu Date của Excel',
      promptHint: () => 'Dạng dd/mm/yyyy, ví dụ 05/09/2014.',
      examples: () => ['05/09/2014', '21/12/2013'],
      text: true,
      width: 12,
      parse: parseDob,
    },
    {
      key: 'parentPhone',
      header: 'SĐT phụ huynh',
      aliases: ['SĐT', 'Số điện thoại', 'Điện thoại', 'SĐT PH', 'Số điện thoại phụ huynh'],
      required: false,
      format: () => '10 chữ số, bắt đầu bằng 0',
      promptHint: () => '10 chữ số, bắt đầu bằng 0, không có dấu cách hay dấu chấm.',
      examples: () => ['0912345678', ''],
      text: true,
      width: 15,
      parse: parsePhone,
    },
  ],
};
