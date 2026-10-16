import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { buildPrompt } from './prompt';
import { SheetSchema } from './sheet.schema';
import {
  NonRetryableExtractionError,
  type AnswerExtractor,
  type ExtractInput,
  type ExtractResult,
} from './types';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

// Server-side fallback ("default") có trên Opus 5.5, Opus 5, Sonnet 5.5 và Fable 5.1; Haiku 5.5 không có.
function supportsServerFallback(model: string): boolean {
  return /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5-1)$/.test(model);
}

export class ClaudeExtractor implements AnswerExtractor {
  readonly name = 'claude' as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: Effort;

  constructor(options: { apiKey?: string; model?: string; effort?: Effort } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Thiếu ANTHROPIC_API_KEY. Tạo key trên Claude Console rồi điền vào .env');
    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? process.env.GRADING_MODEL ?? 'claude-opus-5-5';
    this.effort = options.effort ?? ((process.env.GRADING_EFFORT ?? 'low') as Effort);
  }

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...input.images.map((img) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: img.mimeType as ImageMediaType,
          data: img.data.toString('base64'),
        },
      })),
      { type: 'text' as const, text: buildPrompt(input) },
    ];

    const fallback = supportsServerFallback(this.model)
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
      : {};

    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        ...fallback,
        output_config: { effort: this.effort, format: betaZodOutputFormat(SheetSchema) },
        messages: [{ role: 'user', content }],
      });
    } catch (error) {
      // 400/401/403/404 lặp lại y hệt nếu thử lại; 429 và 5xx thì để hàng đợi thử lại
      if (
        error instanceof Anthropic.BadRequestError ||
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError ||
        error instanceof Anthropic.NotFoundError
      ) {
        throw new NonRetryableExtractionError(`Claude API: ${error.message}`);
      }
      throw error;
    }

    // Kiểm tra stop_reason trước khi dùng kết quả
    if (response.stop_reason === 'refusal') {
      throw new NonRetryableExtractionError('Claude từ chối đọc ảnh này');
    }
    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw new NonRetryableExtractionError(`Claude không trả kết quả đầy đủ (stop_reason: ${response.stop_reason})`);
    }

    return {
      sheet: response.parsed_output,
      raw: response.parsed_output,
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}
