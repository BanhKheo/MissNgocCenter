import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_VERSION_CODE, type ImportType } from '@missngoc/core';
import { AccessService } from '../../common/access/access.service';
import type { AuthUser } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import type { ImportContext, ImportSpec } from './import-spec';
import { isRequired } from './import-spec';
import { buildImportPrompt } from './prompt';
import { answerKeysImportSpec } from './specs/answer-keys.spec';
import { studentsImportSpec } from './specs/students.spec';
import { validateTable } from './validate';
import { MAX_IMPORT_BYTES, readTable } from './workbook';

const SPECS: Record<ImportType, ImportSpec> = {
  students: studentsImportSpec,
  'answer-keys': answerKeysImportSpec,
};

export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  size: number;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  spec(type: string): ImportSpec {
    const spec = SPECS[type as ImportType];
    if (!spec) throw new BadRequestException(`Loại import không hợp lệ: ${type}`);
    return spec;
  }

  async context(user: AuthUser, type: ImportType, ids: { classId?: string; examId?: string }): Promise<ImportContext> {
    if (type === 'students' && ids.classId) {
      const cls = await this.access.assertClass(user, ids.classId);
      return { className: cls.name };
    }
    if (type === 'answer-keys') {
      if (!ids.examId) throw new BadRequestException('Thiếu examId');
      const exam = await this.access.assertExam(user, ids.examId);
      const keys = await this.prisma.answerKey.findMany({ where: { examId: exam.id }, select: { versionCode: true } });
      return {
        examTitle: exam.title,
        className: exam.class.name,
        questionCount: exam.questionCount,
        options: exam.options,
        maxScore: Number(exam.maxScore),
        versionCodes: keys.map((k) => k.versionCode).filter((v) => v !== DEFAULT_VERSION_CODE),
      };
    }
    return {};
  }

  /** Nội dung khung "File cần đúng định dạng sau" + prompt chatbot */
  describe(spec: ImportSpec, ctx: ImportContext) {
    return {
      type: spec.type,
      title: spec.title,
      columns: spec.columns.map((c) => ({
        header: c.header,
        required: isRequired(c, ctx),
        format: c.format(ctx),
        examples: c.examples(ctx),
      })),
      rules: spec.rules(ctx),
      prompt: buildImportPrompt(spec, ctx),
      privacyNote: spec.privacyNote ?? null,
      maxRows: spec.maxRows,
    };
  }

  async parse(spec: ImportSpec, file: UploadedFileLike | undefined, ctx: ImportContext) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    if (file.size > MAX_IMPORT_BYTES) throw new BadRequestException('File quá lớn, tối đa 5 MB');
    const table = await readTable(file.buffer, file.originalname);
    return validateTable(spec, table, ctx);
  }
}
