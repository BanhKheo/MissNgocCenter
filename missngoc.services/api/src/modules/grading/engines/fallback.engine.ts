import { NonRetryableExtractionError, type AnswerExtractor, type ExtractInput, type ExtractResult } from './types';

/** Lỗi hết lượt hoặc quá giới hạn gọi: Gemini miễn phí 20 lượt/ngày, lỗi 429 */
export function isQuotaError(err: unknown): boolean {
  return /\b429\b|quota|rate limit|resource.?exhausted/i.test((err as Error)?.message ?? '');
}

/**
 * Nhiều engine theo thứ tự ưu tiên, ví dụ GRADING_ENGINE=gemini,claude.
 * Engine trước lỗi (hết lượt, quá tải, sai key, trả sai định dạng) thì bài đó chuyển sang engine sau.
 * Engine báo hết lượt được nghỉ một lúc, các bài sau đi thẳng engine sau, không gọi thử lại mỗi bài.
 */
export class FallbackExtractor implements AnswerExtractor {
  readonly name: string;
  readonly model: string;
  private readonly restUntil = new Map<string, number>();

  constructor(
    private readonly engines: AnswerExtractor[],
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.name = engines.map((e) => e.name).join(',');
    this.model = engines.map((e) => e.model).join(',');
  }

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const ready = this.engines.filter((e) => (this.restUntil.get(e.name) ?? 0) <= this.now());
    // Engine nào cũng đang nghỉ thì vẫn thử lần lượt, biết đâu đã có lượt lại
    const order = ready.length > 0 ? ready : this.engines;
    const errors: string[] = [];
    let retryable = false;
    for (const engine of order) {
      try {
        const res = await engine.extract(input);
        this.restUntil.delete(engine.name);
        return { ...res, engine: res.engine ?? engine.name };
      } catch (err) {
        errors.push(`${engine.name}: ${(err as Error).message}`);
        if (!(err instanceof NonRetryableExtractionError)) retryable = true;
        if (isQuotaError(err)) this.restUntil.set(engine.name, this.now() + this.cooldownMs);
      }
    }
    // Có engine lỗi tạm thời (hết lượt, mất mạng) thì để hàng đợi thử lại sau
    const message = errors.join(' | ');
    throw retryable ? new Error(message) : new NonRetryableExtractionError(message);
  }
}
