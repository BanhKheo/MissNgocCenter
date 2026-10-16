import { ClaudeExtractor } from './claude.engine';
import { FallbackExtractor } from './fallback.engine';
import { GeminiExtractor } from './gemini.engine';
import { MockExtractor } from './mock.engine';
import type { AnswerExtractor, EngineName } from './types';

function createOne(name: string): AnswerExtractor {
  switch (name as EngineName) {
    case 'claude':
      return new ClaudeExtractor();
    case 'gemini':
      return new GeminiExtractor();
    case 'mock':
      return new MockExtractor();
    default:
      throw new Error(`GRADING_ENGINE không hợp lệ: ${name}. Chọn một trong: claude, gemini, mock`);
  }
}

/**
 * Chọn engine theo GRADING_ENGINE. Đổi engine không phải sửa code.
 * Ghi nhiều engine ngăn bằng dấu phẩy (ví dụ gemini,claude) thì engine đầu lỗi hoặc hết lượt sẽ chuyển sang engine sau.
 */
export function createExtractor(name: string | undefined = process.env.GRADING_ENGINE): AnswerExtractor {
  const names = (name ?? 'mock')
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  if (names.length <= 1) return createOne(names[0] ?? 'mock');
  const minutes = Number(process.env.FALLBACK_COOLDOWN_MINUTES ?? 15);
  return new FallbackExtractor(names.map(createOne), (Number.isFinite(minutes) ? minutes : 15) * 60_000);
}
