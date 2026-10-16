import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { foldVietnamese } from '../../common/text';
import type { CellValue, ImportColumn, ImportContext, ImportSpec } from './import-spec';
import { isRequired } from './import-spec';

export interface RawTable {
  headers: string[];
  rows: { rowNumber: number; cells: CellValue[] }[];
}

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Đọc file .xlsx hoặc .csv (UTF-8) thành bảng: dòng đầu có dữ liệu là tiêu đề. */
export async function readTable(buffer: Buffer, fileName: string): Promise<RawTable> {
  const lower = fileName.toLowerCase();
  let grid: { rowNumber: number; cells: CellValue[] }[];
  if (lower.endsWith('.csv')) grid = parseCsv(buffer);
  else if (lower.endsWith('.xlsx')) grid = await parseXlsx(buffer);
  else throw new BadRequestException('Chỉ nhận file .xlsx hoặc .csv');

  const nonEmpty = grid.filter((r) => r.cells.some((c) => !isBlank(c)));
  if (nonEmpty.length === 0) throw new BadRequestException('File không có dữ liệu');
  const [header, ...rows] = nonEmpty;
  return { headers: header.cells.map((c) => cellToString(c)), rows };
}

async function parseXlsx(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('Không đọc được file Excel. Hãy lưu lại dạng .xlsx rồi thử lại');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException('File Excel không có trang tính nào');
  const out: { rowNumber: number; cells: CellValue[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: CellValue[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(normalizeExcelValue(row.getCell(c).value));
    out.push({ rowNumber, cells });
  });
  return out;
}

function normalizeExcelValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return normalizeExcelValue((v.result ?? null) as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('error' in v) return null;
  }
  return String(v);
}

function parseCsv(buffer: Buffer) {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: { rowNumber: number; cells: CellValue[] }[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let rowNumber = 1;
  const pushRow = () => {
    cells.push(field);
    rows.push({ rowNumber, cells: cells.map((c) => (c === '' ? null : c)) });
    cells = [];
    field = '';
    rowNumber++;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      cells.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else field += ch;
  }
  if (field !== '' || cells.length > 0) pushRow();
  return rows;
}

export function isBlank(v: CellValue): boolean {
  return v === null || (typeof v === 'string' && v.trim() === '');
}

export function cellToString(v: CellValue): string {
  if (v === null) return '';
  if (v instanceof Date) {
    const dd = String(v.getUTCDate()).padStart(2, '0');
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${v.getUTCFullYear()}`;
  }
  return String(v).trim();
}

function headerKey(s: string): string {
  return foldVietnamese(s).replace(/[^a-z0-9]/g, '');
}

/** Ghép cột trong file với cấu hình theo tên tiêu đề (không phân biệt hoa thường, dấu) */
export function mapColumns(spec: ImportSpec, headers: string[], ctx: ImportContext) {
  const index = new Map<string, number>();
  const fileErrors: string[] = [];
  const normalized = headers.map(headerKey);
  for (const col of spec.columns) {
    const names = [col.header, ...col.aliases].map(headerKey);
    const at = normalized.findIndex((h) => h !== '' && names.includes(h));
    if (at >= 0) index.set(col.key, at);
    else if (isRequired(col, ctx)) fileErrors.push(`Thiếu cột "${col.header}". Dòng 1 phải là tiêu đề giống file mẫu`);
  }
  return { index, fileErrors };
}

/** File mẫu: trang 1 có tiêu đề + 2 dòng ví dụ, trang 2 là hướng dẫn định dạng */
export async function buildTemplate(spec: ImportSpec, ctx: ImportContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.title.slice(0, 31));
  ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  for (let i = 0; i < 2; i++) {
    ws.addRow(spec.columns.map((c) => c.examples(ctx)[i]));
  }
  spec.columns.forEach((c: ImportColumn, idx) => {
    if (c.text) ws.getColumn(idx + 1).numFmt = '@';
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const guide = wb.addWorksheet('Hướng dẫn');
  guide.columns = [
    { header: 'Cột', key: 'header', width: 18 },
    { header: 'Bắt buộc', key: 'required', width: 10 },
    { header: 'Định dạng', key: 'format', width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  for (const c of spec.columns) {
    guide.addRow({ header: c.header, required: isRequired(c, ctx) ? 'Có' : 'Không', format: c.format(ctx) });
  }
  guide.addRow({});
  for (const rule of spec.rules(ctx)) guide.addRow({ header: '•', format: rule });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
