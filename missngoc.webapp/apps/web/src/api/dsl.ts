import axios from 'axios';

/**
 * Trình biên dịch ExamDSL (service Python missngoc.dsl). Vite (máy dev) và Nginx (máy trung tâm)
 * chuyển /dsl/ sang service đó. Service không trả envelope { status, data } như API NestJS.
 */
const dslHttp = axios.create({ baseURL: '/dsl/api', timeout: 20_000 });

export interface DslDiagnostic {
  severity: 'error' | 'warning';
  phase: 'lexical' | 'syntax' | 'semantic' | 'optimize';
  code: string;
  message: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

export interface DslKeyItem {
  q: number;
  kind: 'choice' | 'text';
  correct: string[];
  points: number;
}

export interface DslBand {
  min: number;
  label: string;
  fill: string;
  font: string;
}

export interface DslOutputs {
  exam: { title: string; gradingMode: string; questionCount: number; options: string; maxScore: number; layoutHint?: string };
  /** Mã đề → đáp án; mã đề chung ghi là "_" như trên URL của app */
  keys: Record<string, { items: DslKeyItem[] }>;
  report: { scoreBands: DslBand[] } & Record<string, unknown>;
  review: unknown[];
}

export interface DslPreview {
  title: string;
  questions: number;
  options: string;
  max: number;
  versions: string[];
  totalPoints: number;
  sections: { name: string; kind: 'choice' | 'text'; questions: number; points: number; perQuestion: number }[];
  bands: DslBand[];
  rules: { message: string | null; scope: 'answer' | 'submission'; when: string }[];
  defaultReview: boolean;
}

export interface DslCompileResult {
  ok: boolean;
  stage: string;
  diagnostics: DslDiagnostic[];
  outputs?: DslOutputs;
  preview?: DslPreview;
}

export interface DslSimulateResult {
  summary: {
    submissions: number;
    needsReview: number;
    needsReviewPercent: number;
    perRule: Record<string, { flags: number; submissions: number }>;
    uncertainNotFlagged: number;
    averageScore: number | null;
  };
  results: {
    student: string;
    version: string | null;
    score: number | null;
    band: string | null;
    status: 'GRADED' | 'NEEDS_REVIEW';
    flags: { rule: string; q?: number }[];
  }[];
}

export async function dslCompile(source: string): Promise<DslCompileResult> {
  return (await dslHttp.post<DslCompileResult>('/compile', { source })).data;
}

/** Chấm và chạy luật duyệt trên kết quả AI đọc (data: { submissions: [{ studentName, raw }] }) */
export async function dslSimulate(source: string, data: unknown): Promise<DslSimulateResult> {
  return (await dslHttp.post<DslSimulateResult>('/simulate', { source, data, mask: false })).data;
}
