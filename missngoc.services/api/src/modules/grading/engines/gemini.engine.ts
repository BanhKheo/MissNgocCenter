import { GoogleGenAI } from '@google/genai';
import { buildPrompt } from './prompt';
import { SheetSchema } from './sheet.schema';
import {
  NonRetryableExtractionError,
  type AnswerExtractor,
  type ExtractInput,
  type ExtractResult,
} from './types';

// Schema JSON chỉ dùng các kiểu cơ bản (string enum, integer, array, object) để Gemini nhận chắc chắn.
// Không dùng null: "-" nghĩa là không có lựa chọn, chuỗi rỗng nghĩa là không đọc được hoặc không có chữ.
const NO_CHOICE = '-';
const GEMINI_SHEET_SCHEMA = {
  type: 'object',
  properties: {
    studentNameRead: { type: 'string' },
    versionCodeRead: { type: 'string' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'integer' },
          choice: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', NO_CHOICE] },
          text: { type: 'string' },
          status: { type: 'string', enum: ['clear', 'blank', 'multiple', 'unclear'] },
        },
        required: ['q', 'choice', 'text', 'status'],
      },
    },
  },
  required: ['studentNameRead', 'versionCodeRead', 'answers'],
};

const FORMAT_NOTE = [
  '',
  'Output format note: write "-" instead of null for "choice",',
  'and an empty string "" instead of null for "text", "studentNameRead" and "versionCodeRead".',
].join('\n');

/** SDK gói lỗi khó đọc; câu báo thật nằm trong body JSON của Google */
function geminiErrorMessage(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      const first = (Array.isArray(parsed) ? parsed[0] : parsed) as { error?: { message?: string } };
      if (first?.error?.message) return first.error.message;
    } catch {
      return body.slice(0, 300);
    }
  }
  return (err as Error)?.message ?? String(err);
}

interface GeminiRawAnswer {
  q: number;
  choice: string;
  text?: string;
  status: string;
}

interface GeminiRawSheet {
  studentNameRead: string;
  versionCodeRead: string;
  answers: GeminiRawAnswer[];
}

export class GeminiExtractor implements AnswerExtractor {
  readonly name = 'gemini' as const;
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly thinkingLevel: string;

  constructor(options: { apiKey?: string; model?: string; thinkingLevel?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY. Tạo key ở https://aistudio.google.com rồi điền vào .env');
    this.client = new GoogleGenAI({ apiKey });
    this.model = options.model ?? process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    this.thinkingLevel = options.thinkingLevel ?? process.env.GEMINI_THINKING_LEVEL ?? 'low';
  }

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const interaction = await this.client.interactions
      .create(
        {
          model: this.model,
          input: [
            { type: 'text', text: buildPrompt(input) + FORMAT_NOTE },
            ...input.images.map((img) => ({
              type: 'image' as const,
              data: img.data.toString('base64'),
              mime_type: img.mimeType,
              resolution: 'high',
            })),
          ],
          response_format: { type: 'text', mime_type: 'application/json', schema: GEMINI_SHEET_SCHEMA },
          generation_config: { thinking_level: this.thinkingLevel },
          // Không lưu yêu cầu và kết quả trên máy chủ Google
          store: false,
        },
        // SDK mặc định tự thử lại lỗi 429 tới 4 lần; hết lượt trong ngày thì chờ vô ích.
        // Hàng đợi và engine dự phòng đã lo việc thử lại.
        { maxRetries: 0 },
      )
      .catch((err: unknown) => {
        // 4xx (sai key, sai model, yêu cầu không hợp lệ) gọi lại vẫn lỗi y hệt; 408, 429 và 5xx thì để hàng đợi thử lại
        const status = (err as { status?: number })?.status;
        const detail = geminiErrorMessage(err);
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          throw new NonRetryableExtractionError(`Gemini API ${status}: ${detail}`);
        }
        throw new Error(`Gemini API ${status ?? ''}: ${detail}`.trim());
      });

    if (interaction.status !== 'completed' || !interaction.output_text) {
      throw new Error(`Gemini không trả kết quả (status: ${interaction.status})`);
    }

    let raw: GeminiRawSheet;
    try {
      raw = JSON.parse(interaction.output_text) as GeminiRawSheet;
    } catch {
      throw new NonRetryableExtractionError('Gemini trả về JSON không hợp lệ');
    }

    const parsed = SheetSchema.safeParse({
      studentNameRead: raw.studentNameRead || null,
      versionCodeRead: raw.versionCodeRead || null,
      answers: (raw.answers ?? []).map((a) => ({
        q: a.q,
        choice: a.choice === NO_CHOICE || a.choice === '' ? null : a.choice,
        text: a.text ? a.text : null,
        status: a.status,
      })),
    });
    if (!parsed.success) {
      throw new NonRetryableExtractionError(`Kết quả Gemini sai định dạng: ${parsed.error.message.slice(0, 300)}`);
    }

    return {
      sheet: parsed.data,
      raw,
      model: this.model,
      usage: {
        inputTokens: interaction.usage?.total_input_tokens,
        outputTokens:
          (interaction.usage?.total_output_tokens ?? 0) + (interaction.usage?.total_thought_tokens ?? 0) || undefined,
      },
    };
  }
}
