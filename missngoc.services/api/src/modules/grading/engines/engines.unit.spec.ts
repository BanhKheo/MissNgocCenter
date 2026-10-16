import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FallbackExtractor } from './fallback.engine';
import { NonRetryableExtractionError, type AnswerExtractor, type ExtractInput, type ExtractResult } from './types';

const input: ExtractInput = { images: [{ data: Buffer.from('anh'), mimeType: 'image/jpeg' }], questionCount: 2, options: ['A', 'B', 'C', 'D'] };

const okResult = (model: string): ExtractResult => ({
  sheet: { studentNameRead: null, versionCodeRead: null, answers: [] },
  raw: {},
  model,
  usage: {},
});

/** Engine giả: chạy lần lượt các hành vi đã cho, đếm số lần được gọi */
function fakeEngine(name: string, behaviours: (Error | 'ok')[]): AnswerExtractor & { calls: number } {
  return {
    name,
    model: `${name}-model`,
    calls: 0,
    async extract() {
      const b = behaviours[Math.min(this.calls++, behaviours.length - 1)];
      if (b === 'ok') return okResult(`${name}-model`);
      throw b;
    },
  };
}

test('fallback: Gemini hết lượt thì chuyển sang engine sau, Gemini được nghỉ rồi thử lại sau', async () => {
  let now = 0;
  const gemini = fakeEngine('gemini', [new Error('Gemini API 429: Rate limit exceeded (limit: 20 requests per day)'), 'ok']);
  const claude = fakeEngine('claude', ['ok']);
  const chain = new FallbackExtractor([gemini, claude], 15 * 60_000, () => now);

  const first = await chain.extract(input);
  assert.equal(first.engine, 'claude');
  assert.equal(first.model, 'claude-model');

  // Đang nghỉ: bài sau đi thẳng engine sau, không gọi Gemini
  now = 5 * 60_000;
  assert.equal((await chain.extract(input)).engine, 'claude');
  assert.equal(gemini.calls, 1);

  // Hết giờ nghỉ: thử Gemini lại
  now = 16 * 60_000;
  assert.equal((await chain.extract(input)).engine, 'gemini');
  assert.equal(gemini.calls, 2);
});

test('fallback: mọi engine đều lỗi thì báo đủ lý do; có lỗi tạm thời thì để hàng đợi thử lại', async () => {
  const bad = new FallbackExtractor(
    [fakeEngine('gemini', [new NonRetryableExtractionError('ảnh hỏng')]), fakeEngine('claude', [new NonRetryableExtractionError('ảnh hỏng')])],
    60_000,
  );
  await assert.rejects(bad.extract(input), (err: Error) => err instanceof NonRetryableExtractionError && /gemini: ảnh hỏng \| claude: ảnh hỏng/.test(err.message));

  const busy = new FallbackExtractor(
    [fakeEngine('gemini', [new Error('Gemini API 503: overloaded')]), fakeEngine('claude', [new NonRetryableExtractionError('Claude API: sai key')])],
    60_000,
  );
  await assert.rejects(busy.extract(input), (err: Error) => !(err instanceof NonRetryableExtractionError) && /503/.test(err.message));
});
