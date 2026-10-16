import { createHash } from 'crypto';
import type { AnswerExtractor, Choice, ExtractInput, ExtractResult, ExtractedAnswer } from './types';

// Từ mẫu cho câu điền từ, có từ cố ý sai chính tả
const SAMPLE_WORDS = ['twice', 'water', 'weekends', 'eight hours', 'creativty', 'volunteers', 'healthy', 'usefull'];

/**
 * Engine giả để thử giao diện khi chưa có API key. Không đọc ảnh thật:
 * sinh lựa chọn cố định theo hash của ảnh, khoảng 5% câu "không chắc".
 */
export class MockExtractor implements AnswerExtractor {
  readonly name = 'mock' as const;
  readonly model = 'mock';

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const hash = createHash('sha256');
    for (const img of input.images) hash.update(img.data);
    const seed = hash.digest();

    const textQuestions = new Set(input.textQuestions ?? []);
    const answers: ExtractedAnswer[] = [];
    for (let q = 1; q <= input.questionCount; q++) {
      const byte = seed[q % seed.length] ^ (q * 37);
      const roll = (byte + q) % 100;
      if (textQuestions.has(q)) {
        const text = SAMPLE_WORDS[byte % SAMPLE_WORDS.length];
        if (roll < 3) answers.push({ q, choice: null, text: null, status: 'blank' });
        else answers.push({ q, choice: null, text, status: roll < 8 ? 'unclear' : 'clear' });
        continue;
      }
      const choice = input.options[byte % input.options.length] as Choice;
      if (roll < 3) answers.push({ q, choice: null, status: 'blank' });
      else if (roll < 8) answers.push({ q, choice, status: 'unclear' });
      else answers.push({ q, choice, status: 'clear' });
    }
    await new Promise((r) => setTimeout(r, 300));
    const sheet = { studentNameRead: null, versionCodeRead: null, answers };
    return { sheet, raw: sheet, model: this.model, usage: {} };
  }
}
