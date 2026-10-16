/**
 * PoC: cho AI đọc vài bài thật, in kết quả từng câu và so với đáp án chuẩn nếu có.
 * Dùng đúng engine, lời nhắc và bước kiểm tra như app thật.
 *
 * Ví dụ:
 *   npm run poc -- --engine gemini --questions 40 poc-samples/bai1.jpg poc-samples/bai2
 *   npm run poc -- --engine gemini --questions 40 --truth poc-samples/truth.csv poc-samples/bai1.jpg
 *   npm run poc -- --engine gemini --questions 41 --text 5-8,18-21 poc-samples/de-unit1-3
 *
 * Mỗi đối số là một bài: một file ảnh, hoặc một thư mục chứa các trang của cùng một bài.
 * --each <thư mục>: mỗi ảnh trong thư mục là một bài riêng (tiện trên Windows, không cần *.jpg).
 * --text: các câu điền từ, ví dụ 5-8,18-21.
 * File truth.csv (tuỳ chọn) có 3 cột: sheet,q,choice — sheet là tên file/thư mục, choice để trống nếu bỏ trống.
 * Câu điền từ: cột choice ghi đúng chữ học sinh viết, kể cả sai chính tả (không phải đáp án đúng).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { parseArgs } from 'util';
import { normalizeTextAnswer, type Choice } from '@missngoc/core';
import { normalizeImage } from '../common/images';
import { createExtractor } from '../modules/grading/engines/engine.factory';
import { answerValue, normalizeSheet } from '../modules/grading/engines/normalize';
import type { ExtractImage, ExtractedSheet } from '../modules/grading/engines/types';
import { loadEnv } from './load-env';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// npm chạy script trong thư mục api; INIT_CWD là thư mục bạn đứng khi gõ lệnh
const BASE_DIR = process.env.INIT_CWD ?? process.cwd();

function listSheetFiles(path: string): string[] {
  const full = resolve(BASE_DIR, path);
  if (!existsSync(full)) throw new Error(`Không tìm thấy: ${path}`);
  if (statSync(full).isDirectory()) {
    const files = readdirSync(full)
      .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => join(full, f));
    if (files.length === 0) throw new Error(`Thư mục ${path} không có ảnh JPEG/PNG/WebP`);
    return files;
  }
  return [full];
}

function readTruth(path: string | undefined): Map<string, Map<number, string | null>> {
  const truth = new Map<string, Map<number, string | null>>();
  if (!path) return truth;
  const lines = readFileSync(resolve(BASE_DIR, path), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [sheet, q, choice] = line.split(',').map((s) => s.trim());
    const map = truth.get(sheet) ?? new Map<number, string | null>();
    map.set(Number(q), choice && choice !== '-' ? choice : null);
    truth.set(sheet, map);
  }
  return truth;
}

/** "5-8,18-21" → [5, 6, 7, 8, 18, 19, 20, 21] */
function parseRanges(value: string | undefined): number[] {
  const out: number[] = [];
  for (const part of (value ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const [a, b] = part.split(/[-–]/).map(Number);
    if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) throw new Error(`--text không hợp lệ: ${part}`);
    for (let q = a; q <= (b ?? a); q++) out.push(q);
  }
  return out;
}

/** Trắc nghiệm so chữ cái; điền từ so nguyên văn, chỉ bỏ hoa/thường, khoảng trắng và dấu câu cuối */
function sameReading(isText: boolean, got: string | null, expected: string | null): boolean {
  if (got === null || expected === null) return got === expected;
  return isText ? normalizeTextAnswer(got) === normalizeTextAnswer(expected) : got.toUpperCase() === expected.toUpperCase();
}

async function main() {
  loadEnv();
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      engine: { type: 'string', default: process.env.GRADING_ENGINE ?? 'gemini' },
      questions: { type: 'string', short: 'q' },
      options: { type: 'string', default: 'ABCD' },
      layout: { type: 'string' },
      truth: { type: 'string' },
      each: { type: 'string' },
      text: { type: 'string' },
    },
  });
  if (values.each) {
    const dir = resolve(BASE_DIR, values.each);
    const files = readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    positionals.push(...files.map((f) => join(dir, f)));
  }

  const questionCount = Number(values.questions);
  if (!questionCount || positionals.length === 0) {
    console.log(
      'Cách dùng: npm run poc -- --engine gemini --questions 40 [--options ABCD] [--text 5-8,18-21] [--layout "..."] [--truth truth.csv] [--each thư-mục] <ảnh hoặc thư mục>...',
    );
    process.exit(1);
  }
  const options = values.options!.toUpperCase().split('') as Choice[];
  const textQuestions = parseRanges(values.text);
  const isText = new Set(textQuestions);
  const extractor = createExtractor(values.engine);
  const truth = readTruth(values.truth);
  console.log(
    `Engine: ${extractor.name} · model: ${extractor.model} · ${questionCount} câu · lựa chọn ${options.join('')}` +
      (textQuestions.length ? ` · ${textQuestions.length} câu điền từ` : '') +
      '\n',
  );

  const results: unknown[] = [];
  const totals = { questions: 0, uncertain: 0, compared: 0, wrong: 0, confidentWrong: 0 };
  // Điền từ đếm riêng: lỗi đáng sợ nhất là AI tự sửa chính tả mà vẫn báo chắc chắn
  const textTotals = { compared: 0, wrong: 0, confidentWrong: 0 };

  for (const sheetPath of positionals) {
    const files = listSheetFiles(sheetPath);
    const images: ExtractImage[] = [];
    for (const f of files) {
      const img = await normalizeImage(readFileSync(f));
      images.push({ data: img.data, mimeType: img.mimeType });
    }

    const name = basename(sheetPath);
    const started = Date.now();
    let sheet: ExtractedSheet;
    let usage = {};
    let engineUsed = extractor.name;
    try {
      const res = await extractor.extract({ images, questionCount, options, layoutHint: values.layout, textQuestions });
      sheet = normalizeSheet(res.sheet, questionCount, options, textQuestions);
      usage = res.usage;
      engineUsed = res.engine ?? extractor.name;
    } catch (err) {
      console.log(`✗ ${name}: ${(err as Error).message}\n`);
      results.push({ sheet: name, error: (err as Error).message });
      continue;
    }
    const ms = Date.now() - started;
    const expected = truth.get(name);

    console.log(`■ ${name} (${files.length} ảnh, ${(ms / 1000).toFixed(1)} giây, ${engineUsed})`);
    console.log(`  Họ tên đọc được: ${sheet.studentNameRead ?? '—'} · Mã đề: ${sheet.versionCodeRead ?? '—'}`);
    const cells: string[] = [];
    const textLines: string[] = [];
    for (const a of sheet.answers) {
      const value = answerValue(a);
      const text = isText.has(a.q);
      const shown = text && value !== null ? `"${value}"` : (value ?? '?');
      const mark = a.status === 'clear' ? shown : a.status === 'blank' ? '·' : `${shown}?`;
      let flag = '';
      if (expected?.has(a.q)) {
        const exp = expected.get(a.q) ?? null;
        const t = text ? textTotals : totals;
        t.compared++;
        if (!sameReading(text, value, exp)) {
          t.wrong++;
          if (a.status === 'clear' || a.status === 'blank') t.confidentWrong++;
          flag = ` ✗(${exp ?? '·'})`;
        }
      }
      if (text) textLines.push(`  Câu ${a.q}: ${mark}${flag}`);
      else cells.push(`${String(a.q).padStart(2)}:${mark}${flag}`);
    }
    for (let i = 0; i < cells.length; i += 10) console.log('  ' + cells.slice(i, i + 10).map((c) => c.padEnd(8)).join(''));
    if (textLines.length) console.log(textLines.join('\n'));
    const uncertain = sheet.answers.filter((a) => a.status === 'unclear' || a.status === 'multiple').length;
    totals.questions += sheet.answers.length;
    totals.uncertain += uncertain;
    console.log(`  Không chắc: ${uncertain}/${sheet.answers.length} · token: ${JSON.stringify(usage)}\n`);
    results.push({ sheet: name, files: files.map((f) => basename(f)), ms, engine: engineUsed, usage, result: sheet });
  }

  console.log('Ký hiệu: A = rõ · · = bỏ trống · A? = không chắc · ✗(B) = sai, đáp án chuẩn là B · "twice" = chữ AI chép ở câu điền từ');
  console.log(`Tổng: ${totals.questions} câu, ${totals.uncertain} câu không chắc.`);
  if (totals.compared > 0) {
    const pct = (n: number) => ((n / totals.compared) * 100).toFixed(2) + '%';
    console.log(
      `So với đáp án chuẩn: ${totals.compared} câu, đọc sai ${totals.wrong} (${pct(totals.wrong)}), ` +
        `sai mà vẫn báo chắc chắn ${totals.confidentWrong} (${pct(totals.confidentWrong)}). Ngưỡng đạt: ≤ 0,2%.`,
    );
  }
  if (textTotals.compared > 0) {
    const pct = (n: number) => ((n / textTotals.compared) * 100).toFixed(2) + '%';
    console.log(
      `Câu điền từ: ${textTotals.compared} câu, chép sai ${textTotals.wrong} (${pct(textTotals.wrong)}), ` +
        `sai mà vẫn báo chắc chắn ${textTotals.confidentWrong} (${pct(textTotals.confidentWrong)}). ` +
        'Câu ✗ mà AI chép thành đúng chính tả là lỗi AI tự sửa chữ.',
    );
  }

  const outDir = resolve(BASE_DIR, 'poc-results');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${extractor.name}.json`);
  writeFileSync(
    outFile,
    JSON.stringify({ engine: extractor.name, model: extractor.model, questionCount, textQuestions, totals, textTotals, results }, null, 2),
  );
  console.log(`\nĐã lưu kết quả: ${outFile}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
