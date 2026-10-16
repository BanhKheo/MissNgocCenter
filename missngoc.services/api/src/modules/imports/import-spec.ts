import type { ImportType } from '@missngoc/core';

export type CellValue = string | number | boolean | Date | null;

export interface ImportContext {
  className?: string;
  examTitle?: string;
  questionCount?: number;
  options?: string; // ví dụ ABCD
  maxScore?: number;
  versionCodes?: string[];
}

export interface ColumnParseResult {
  value?: unknown;
  error?: string;
}

/**
 * Một cột của file import. Từ cùng một cấu hình sinh ra: khung "File cần đúng định dạng sau",
 * file mẫu, prompt cho chatbot và bộ kiểm tra (FR-IMP-01..04). Sửa ở đây thì cả 4 đổi theo.
 */
export interface ImportColumn {
  key: string;
  header: string;
  aliases: string[];
  required: boolean | ((ctx: ImportContext) => boolean);
  /** Mô tả ngắn hiện trong khung định dạng */
  format: (ctx: ImportContext) => string;
  /** Hướng dẫn cho chatbot, viết thành câu đầy đủ */
  promptHint: (ctx: ImportContext) => string;
  examples: (ctx: ImportContext) => [string, string];
  /** Ô kiểu Text trong file mẫu, để Excel không làm mất số 0 đầu */
  text?: boolean;
  width: number;
  parse: (raw: CellValue, ctx: ImportContext) => ColumnParseResult;
}

export interface ImportSpec {
  type: ImportType;
  title: string;
  /** "học sinh", "câu" — dùng trong câu "Mỗi ... một dòng" */
  rowNoun: string;
  columns: ImportColumn[];
  rules: (ctx: ImportContext) => string[];
  contextLines: (ctx: ImportContext) => string[];
  privacyNote?: string;
  maxRows: number;
}

export interface RowError {
  column: string;
  message: string;
}

export interface PreviewRow<T = Record<string, unknown>> {
  rowNumber: number;
  values: Record<string, string>;
  parsed: T;
  errors: RowError[];
  action?: 'create' | 'update';
}

export interface ImportPreview<T = Record<string, unknown>, E = unknown> {
  type: ImportType;
  headers: string[];
  rows: PreviewRow<T>[];
  fileErrors: string[];
  summary: { total: number; valid: number; invalid: number; create: number; update: number };
  canSave: boolean;
  saved: boolean;
  extra?: E;
}

export function isRequired(col: ImportColumn, ctx: ImportContext): boolean {
  return typeof col.required === 'function' ? col.required(ctx) : col.required;
}
