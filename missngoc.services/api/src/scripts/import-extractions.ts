/**
 * Nạp kết quả đọc ảnh có sẵn (cùng định dạng JSON Gemini trả về) vào database, thay cho việc gọi AI.
 * Dùng khi hết lượt gọi AI mà đã có người đọc ảnh và ghi ra file. Làm đúng các bước worker làm sau khi AI trả kết quả:
 * lưu extraction, ghi câu trả lời, chuyển bài sang "Cần duyệt" rồi chấm điểm. Job chấm còn chờ của các bài này bị huỷ trước.
 *   npx tsx src/scripts/import-extractions.ts data/manual-extractions/grade10-CN.json
 *
 * File: { examId, engine?, model?, submissions: [{ submissionId, raw: { studentNameRead, versionCodeRead, answers } }] }
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import type { Choice } from '@missngoc/core';
import { namesLikelyMatch } from '../common/text';
import { answerValue, normalizeSheet } from '../modules/grading/engines/normalize';
import { PROMPT_VERSION } from '../modules/grading/engines/prompt';
import { SheetSchema } from '../modules/grading/engines/sheet.schema';
import { ScoringService } from '../modules/grading/services/scoring.service';
import { GRADE_QUEUE } from '../queue/queue.service';
import { loadEnv } from './load-env';

interface RawAnswer {
  q: number;
  choice: string;
  text?: string;
  status: string;
}

interface ImportFile {
  examId: string;
  engine?: string;
  model?: string;
  submissions: {
    submissionId: string;
    studentName?: string;
    raw: { studentNameRead: string; versionCodeRead: string; answers: RawAnswer[] };
  }[];
}

// Bài đã chấm hoặc đã duyệt thì không ghi đè
const IMPORTABLE = ['UPLOADED', 'QUEUED', 'PROCESSING', 'FAILED'];

async function main() {
  loadEnv();
  const file = process.argv[2];
  if (!file) throw new Error('Thiếu đường dẫn file JSON');
  const data = JSON.parse(readFileSync(file, 'utf8')) as ImportFile;
  const prisma = new PrismaClient();
  const scoring = new ScoringService();

  try {
    const exam = await prisma.exam.findUniqueOrThrow({
      where: { id: data.examId },
      include: { answerKeys: { include: { items: true } } },
    });
    const options = exam.options.split('') as Choice[];
    const textQuestions = [
      ...new Set(exam.answerKeys.flatMap((k) => k.items.filter((i) => i.kind === 'text').map((i) => i.questionNo))),
    ].sort((a, b) => a - b);
    const ids = data.submissions.map((s) => s.submissionId);

    // Huỷ job chờ trước, để worker không gọi AI rồi ghi đè lên kết quả nạp vào
    const cancelled = await prisma.$executeRaw`
      UPDATE pgboss.job SET state = 'cancelled', completed_on = now()
      WHERE name = ${GRADE_QUEUE} AND state IN ('created', 'retry') AND data->>'submissionId' = ANY(${ids})`;
    console.log(`Huỷ ${cancelled} job chấm đang chờ`);
    const active = await prisma.$queryRaw<{ id: string }[]>`
      SELECT data->>'submissionId' AS id FROM pgboss.job
      WHERE name = ${GRADE_QUEUE} AND state = 'active' AND data->>'submissionId' = ANY(${ids})`;
    const busy = new Set(active.map((a) => a.id));

    let imported = 0;
    for (const item of data.submissions) {
      const label = item.studentName ?? item.submissionId;
      const sub = await prisma.submission.findUnique({ where: { id: item.submissionId }, include: { student: true } });
      if (!sub || sub.examId !== exam.id) {
        console.warn(`Bỏ qua ${label}: không có bài này trong bài kiểm tra`);
        continue;
      }
      if (busy.has(sub.id)) {
        console.warn(`Bỏ qua ${label}: worker đang đọc bài này, chạy lại script sau ít phút`);
        continue;
      }
      if (!IMPORTABLE.includes(sub.status)) {
        console.warn(`Bỏ qua ${label}: bài đang ở trạng thái ${sub.status}`);
        continue;
      }

      const { raw } = item;
      const parsed = SheetSchema.parse({
        studentNameRead: raw.studentNameRead || null,
        versionCodeRead: raw.versionCodeRead || null,
        answers: raw.answers.map((a) => ({
          q: a.q,
          choice: a.choice === '-' || a.choice === '' ? null : a.choice,
          text: a.text ? a.text : null,
          status: a.status,
        })),
      });
      const sheet = normalizeSheet(parsed, exam.questionCount, options, textQuestions);
      const keys = exam.answerKeys;
      let versionCode = sub.versionCode;
      if (keys.length > 1) {
        const read = sheet.versionCodeRead?.toUpperCase().replace(/\s+/g, '') ?? null;
        if (read && keys.some((k) => k.versionCode === read)) versionCode = read;
      }
      const nameMismatch = !namesLikelyMatch(sheet.studentNameRead, sub.student.fullName);

      await prisma.$transaction(async (tx) => {
        await tx.extraction.create({
          data: {
            submissionId: sub.id,
            engine: data.engine ?? 'manual',
            model: data.model ?? 'manual',
            promptVersion: PROMPT_VERSION,
            rawJson: JSON.parse(JSON.stringify(raw)),
            durationMs: 0, // không gọi AI
          },
        });
        await tx.submissionAnswer.deleteMany({ where: { submissionId: sub.id } });
        await tx.submissionAnswer.createMany({
          data: sheet.answers.map((a) => ({
            submissionId: sub.id,
            questionNo: a.q,
            detectedChoice: answerValue(a),
            status: a.status,
            finalChoice: a.status === 'multiple' ? null : answerValue(a),
          })),
        });
        await tx.submission.update({
          where: { id: sub.id },
          data: { status: 'NEEDS_REVIEW', versionCode, studentNameRead: sheet.studentNameRead, nameMismatch, lastError: null },
        });
        await scoring.rescoreSubmission(tx, sub.id, keys);
      });
      imported++;
      console.log(`Đã nạp ${label}`);
    }
    console.log(`Xong: nạp ${imported}/${data.submissions.length} bài`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
