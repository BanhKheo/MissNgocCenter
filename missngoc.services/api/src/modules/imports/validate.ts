import type { ImportContext, ImportPreview, ImportSpec, PreviewRow, RowError } from './import-spec';
import { isRequired } from './import-spec';
import { cellToString, isBlank, mapColumns, type RawTable } from './workbook';

/** Kiểm tra từng ô theo cấu hình cột. Chưa lưu gì (FR-IMP-06). */
export function validateTable(spec: ImportSpec, table: RawTable, ctx: ImportContext): ImportPreview {
  const { index, fileErrors } = mapColumns(spec, table.headers, ctx);
  const rows: PreviewRow[] = [];

  if (table.rows.length > spec.maxRows) {
    fileErrors.push(`File có ${table.rows.length} dòng, tối đa ${spec.maxRows} dòng mỗi lần`);
  }

  if (fileErrors.length === 0) {
    for (const raw of table.rows.slice(0, spec.maxRows)) {
      const values: Record<string, string> = {};
      const parsed: Record<string, unknown> = {};
      const errors: RowError[] = [];
      for (const col of spec.columns) {
        const at = index.get(col.key);
        const cell = at === undefined ? null : (raw.cells[at] ?? null);
        values[col.header] = cellToString(cell);
        if (isBlank(cell)) {
          if (isRequired(col, ctx)) errors.push({ column: col.header, message: 'Bắt buộc, đang để trống' });
          parsed[col.key] = null;
          continue;
        }
        const res = col.parse(cell, ctx);
        if (res.error) errors.push({ column: col.header, message: res.error });
        else parsed[col.key] = res.value ?? null;
      }
      rows.push({ rowNumber: raw.rowNumber, values, parsed, errors });
    }
  }

  return summarize({
    type: spec.type,
    headers: spec.columns.map((c) => c.header),
    rows,
    fileErrors,
    summary: { total: 0, valid: 0, invalid: 0, create: 0, update: 0 },
    canSave: false,
    saved: false,
  });
}

export function summarize<T, E>(preview: ImportPreview<T, E>): ImportPreview<T, E> {
  const invalid = preview.rows.filter((r) => r.errors.length > 0).length;
  preview.summary = {
    total: preview.rows.length,
    valid: preview.rows.length - invalid,
    invalid,
    create: preview.rows.filter((r) => r.errors.length === 0 && r.action === 'create').length,
    update: preview.rows.filter((r) => r.errors.length === 0 && r.action === 'update').length,
  };
  // Còn lỗi thì không lưu dòng nào (FR-IMP-07)
  preview.canSave = preview.fileErrors.length === 0 && invalid === 0 && preview.rows.length > 0;
  return preview;
}
