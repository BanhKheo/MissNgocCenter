import type { Choice, MarkStatus } from '@missngoc/core';

export type { Choice, MarkStatus };

export interface ExtractedAnswer {
  q: number;
  choice: Choice | null;
  text?: string | null; // câu điền từ: chữ học sinh viết, chép nguyên văn
  status: MarkStatus;
}

export interface ExtractedSheet {
  studentNameRead: string | null; // để cảnh báo gắn nhầm học sinh
  versionCodeRead: string | null; // mã đề đọc được trên bài
  answers: ExtractedAnswer[];
}

export interface ExtractImage {
  data: Buffer;
  mimeType: string;
}

export interface ExtractInput {
  images: ExtractImage[];
  questionCount: number;
  options: Choice[];
  layoutHint?: string | null; // ví dụ: 40 câu, 2 cột, mỗi câu 4 ô A–D
  textQuestions?: number[]; // các câu điền từ, lấy từ đáp án
  versionCodes?: string[]; // các mã đề có đáp án, giúp AI đọc mã đề
}

export interface ExtractUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ExtractResult {
  sheet: ExtractedSheet;
  raw: unknown;
  model: string;
  usage: ExtractUsage;
  engine?: string; // engine thật sự đã đọc bài, khi chạy nhiều engine nối tiếp
}

export type EngineName = 'claude' | 'gemini' | 'mock';

export interface AnswerExtractor {
  readonly name: string; // một EngineName, hoặc "gemini,claude" khi nối tiếp nhiều engine
  readonly model: string;
  extract(input: ExtractInput): Promise<ExtractResult>;
}

/** Lỗi không nên thử lại (ảnh hỏng, model từ chối, kết quả sai định dạng). */
export class NonRetryableExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableExtractionError';
  }
}
