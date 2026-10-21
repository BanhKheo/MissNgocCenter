import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_VERSION_CODE, DEFAULT_VERSION_URL_PARAM, splitTextAnswers, type QuestionKind } from '@missngoc/core';
import { AccessService } from '../../../common/access/access.service';
import type { AuthUser } from '../../../common/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { defaultPoints, kindConflicts, missingQuestions } from '../../grading/scoring';
import { ScoringService } from '../../grading/services/scoring.service';
import type { ImportPreview } from '../../imports/import-spec';
import { ImportsService, type UploadedFileLike } from '../../imports/imports.service';
import { answerKeysImportSpec, type AnswerKeyImportRow } from '../../imports/specs/answer-keys.spec';
import { summarize } from '../../imports/validate';
import type { AnswerKeyItemDto } from '../dto/exam.dto';

type Tx = Prisma.TransactionClient;

interface KeyInput {
  versionCode: string;
  items: { q: number; kind: QuestionKind; correct: string[]; points: number }[];
}

export interface AnswerKeyGrid {
  versionCode: string;
  items: { q: number; kind: QuestionKind; correct: string[]; points: number }[];
}

export function versionFromParam(param: string): string {
  const v = param === DEFAULT_VERSION_URL_PARAM ? DEFAULT_VERSION_CODE : param.trim().toUpperCase();
  if (v !== DEFAULT_VERSION_CODE && !/^[A-Z0-9-]{1,10}$/.test(v)) throw new BadRequestException('Mã đề không hợp lệ');
  return v;
}

@Injectable()
export class AnswerKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly imports: ImportsService,
    private readonly scoring: ScoringService,
  ) {}

  async list(user: AuthUser, examId: string): Promise<AnswerKeyGrid[]> {
    await this.access.assertExam(user, examId);
    const keys = await this.prisma.answerKey.findMany({
      where: { examId },
      include: { items: { orderBy: { questionNo: 'asc' } } },
      orderBy: { versionCode: 'asc' },
    });
    return keys.map((k) => ({
      versionCode: k.versionCode,
      items: k.items.map((i) => ({ q: i.questionNo, kind: i.kind, correct: i.correct, points: Number(i.points) })),
    }));
  }

  /** Ghi đè đáp án của một mã đề (idempotent) */
  async put(actor: AuthUser, examId: string, versionParam: string, items: AnswerKeyItemDto[]) {
    const exam = await this.access.assertExam(actor, examId);
    const versionCode = versionFromParam(versionParam);
    const options = exam.options.split('');
    const errors: string[] = [];
    const seen = new Set<number>();
    for (const it of items) {
      if (it.q > exam.questionCount) errors.push(`Câu ${it.q} vượt quá số câu của bài (${exam.questionCount})`);
      if (seen.has(it.q)) errors.push(`Câu ${it.q} bị trùng`);
      seen.add(it.q);
      if (it.kind === 'text') {
        if (it.correct.flatMap(splitTextAnswers).length === 0) errors.push(`Câu ${it.q}: chưa có đáp án điền từ`);
      } else {
        const bad = it.correct.filter((c) => !options.includes(c));
        if (bad.length) errors.push(`Câu ${it.q}: "${bad.join(', ')}" không thuộc bộ lựa chọn ${exam.options}`);
      }
    }
    const missing = missingQuestions(items, exam.questionCount);
    if (missing.length) errors.push(`Thiếu câu: ${formatList(missing)}`);
    if (errors.length) throw new BadRequestException(errors.slice(0, 10).join('. '));

    const pts = defaultPoints(Number(exam.maxScore), exam.questionCount);
    const key: KeyInput = {
      versionCode,
      items: items.map((i) => {
        const kind = i.kind ?? 'choice';
        const correct = kind === 'text' ? [...new Set(i.correct.flatMap(splitTextAnswers))] : [...new Set(i.correct)].sort();
        return { q: i.q, kind, correct, points: i.points ?? pts };
      }),
    };
    const res = await this.prisma.$transaction((tx) => this.save(tx, actor, examId, [key]), { timeout: 60_000 });
    return { saved: true, ...res, keys: await this.list(actor, examId) };
  }

  async remove(actor: AuthUser, examId: string, versionParam: string) {
    await this.access.assertExam(actor, examId);
    const versionCode = versionFromParam(versionParam);
    const key = await this.prisma.answerKey.findUnique({ where: { examId_versionCode: { examId, versionCode } } });
    if (!key) throw new NotFoundException('Không có đáp án của mã đề này');
    await this.prisma.$transaction(async (tx) => {
      await tx.answerKey.delete({ where: { id: key.id } });
      await this.scoring.rescoreExam(tx, examId);
      await this.audit.log({ actorId: actor.id, action: 'answer-key.delete', entity: 'exam', entityId: examId, before: { versionCode } }, tx);
    });
  }

  async import(actor: AuthUser, examId: string, file: UploadedFileLike | undefined, dryRun: boolean) {
    const exam = await this.access.assertExam(actor, examId);
    const ctx = await this.imports.context(actor, 'answer-keys', { examId });
    const preview = (await this.imports.parse(answerKeysImportSpec, file, ctx)) as unknown as ImportPreview<
      AnswerKeyImportRow,
      AnswerKeyGrid[]
    >;

    const validRows = preview.rows.filter((r) => r.errors.length === 0);
    const withCode = preview.rows.filter((r) => r.parsed.versionCode);
    if (withCode.length > 0 && withCode.length < preview.rows.length) {
      for (const r of preview.rows) {
        if (!r.parsed.versionCode && r.errors.length === 0) {
          r.errors.push({ column: 'Mã đề', message: 'Các dòng khác có Mã đề, dòng này đang để trống' });
        }
      }
    }

    // Gom theo mã đề, kiểm tra trùng câu và đủ câu 1..N
    const pts = defaultPoints(Number(exam.maxScore), exam.questionCount);
    const byVersion = new Map<string, Map<number, { kind: QuestionKind; correct: string[]; points: number; rowNumber: number }>>();
    for (const r of validRows) {
      const v = r.parsed.versionCode ?? DEFAULT_VERSION_CODE;
      const items = byVersion.get(v) ?? new Map();
      const prev = items.get(r.parsed.q);
      if (prev) {
        r.errors.push({ column: 'Câu', message: `Câu ${r.parsed.q} của mã đề ${v || 'chung'} trùng với dòng ${prev.rowNumber}` });
        continue;
      }
      items.set(r.parsed.q, {
        kind: r.parsed.answer.kind,
        correct: r.parsed.answer.correct,
        points: r.parsed.points ?? pts,
        rowNumber: r.rowNumber,
      });
      byVersion.set(v, items);
    }
    for (const [v, items] of byVersion) {
      const missing = missingQuestions([...items.keys()].map((q) => ({ q })), exam.questionCount);
      if (missing.length) preview.fileErrors.push(`Mã đề ${v || 'chung'} thiếu câu: ${formatList(missing)}`);
    }

    const keys: KeyInput[] = [...byVersion.entries()]
      .map(([versionCode, items]) => ({
        versionCode,
        items: [...items.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([q, it]) => ({ q, kind: it.kind, correct: it.correct, points: it.points })),
      }))
      .sort((a, b) => a.versionCode.localeCompare(b.versionCode));
    preview.fileErrors.push(...kindConflicts(keys));

    // Bản xem trước hiện đáp án dạng lưới để dò lại với đáp án giấy
    preview.extra = keys;
    for (const r of preview.rows) r.action = 'create';
    summarize(preview);
    if (dryRun || !preview.canSave) return preview;

    await this.prisma.$transaction((tx) => this.save(tx, actor, examId, keys), { timeout: 60_000 });
    preview.saved = true;
    return preview;
  }

  /**
   * Lưu đáp án và chấm lại toàn bộ bài (không gọi AI).
   * Bài chỉ có mã đề chung thì xoá các mã đề khác; lưu mã đề riêng thì xoá mã đề chung.
   * Đổi loại câu (trắc nghiệm ↔ điền từ) thì AI phải đọc lại: bài đã chấm chuyển về "Đã có ảnh" để bấm "Chấm bài mới".
   */
  private async save(tx: Tx, actor: AuthUser, examId: string, keys: KeyInput[]): Promise<{ rescored: number; needRegrade: number }> {
    const before = await tx.answerKey.findMany({ where: { examId }, include: { items: true } });
    const hasDefault = keys.some((k) => k.versionCode === DEFAULT_VERSION_CODE);
    if (hasDefault) {
      await tx.answerKey.deleteMany({ where: { examId, versionCode: { not: DEFAULT_VERSION_CODE } } });
    } else {
      await tx.answerKey.deleteMany({ where: { examId, versionCode: DEFAULT_VERSION_CODE } });
    }
    for (const k of keys) {
      const key = await tx.answerKey.upsert({
        where: { examId_versionCode: { examId, versionCode: k.versionCode } },
        create: { examId, versionCode: k.versionCode },
        update: {},
      });
      await tx.answerKeyItem.deleteMany({ where: { answerKeyId: key.id } });
      await tx.answerKeyItem.createMany({
        data: k.items.map((i) => ({ answerKeyId: key.id, questionNo: i.q, kind: i.kind, correct: i.correct, points: i.points })),
      });
      await tx.answerKey.update({ where: { id: key.id }, data: { updatedAt: new Date() } });
    }

    const after = await tx.answerKey.findMany({ where: { examId }, include: { items: true } });
    const kindsOf = (list: typeof after) =>
      list.map((k) => ({ versionCode: k.versionCode, items: k.items.map((i) => ({ q: i.questionNo, kind: i.kind })) }));
    const conflicts = kindConflicts(kindsOf(after));
    if (conflicts.length) throw new BadRequestException(`${conflicts.slice(0, 5).join('. ')}. Các mã đề phải cùng loại câu`);

    const kindBefore = new Map(before.flatMap((k) => k.items.map((i) => [i.questionNo, i.kind] as const)));
    const kindChanged = after.some((k) => k.items.some((i) => kindBefore.has(i.questionNo) && kindBefore.get(i.questionNo) !== i.kind));
    let needRegrade = 0;
    if (kindChanged) {
      const res = await tx.submission.updateMany({
        where: { examId, status: { in: ['GRADED', 'NEEDS_REVIEW'] } },
        data: { status: 'UPLOADED' },
      });
      needRegrade = res.count;
    }
    const rescored = await this.scoring.rescoreExam(tx, examId);
    await this.audit.log(
      {
        actorId: actor.id,
        action: 'answer-key.save',
        entity: 'exam',
        entityId: examId,
        before: before.map((k) => ({ versionCode: k.versionCode, items: k.items.length })),
        after: keys.map((k) => ({ versionCode: k.versionCode, answers: k.items.map((i) => i.correct.join('/')).join(' ') })),
      },
      tx,
    );
    return { rescored, needRegrade };
  }
}

function formatList(nums: number[]): string {
  return nums.length > 15 ? `${nums.slice(0, 15).join(', ')}… (${nums.length} câu)` : nums.join(', ');
}
