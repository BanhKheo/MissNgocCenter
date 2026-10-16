import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PMS, type ImportType } from '@missngoc/core';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { fileResponse, safeFileName } from '../../common/files';
import { ImportsService } from './imports.service';
import { buildTemplate } from './workbook';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('import-specs')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Cột, ví dụ và prompt chatbot; type là students hoặc answer-keys */
  @Get(':type')
  @RequirePermissions(PMS.CLS_AD, PMS.EXAM_AD)
  async describe(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query('classId') classId?: string,
    @Query('examId') examId?: string,
  ) {
    const spec = this.imports.spec(type);
    const ctx = await this.imports.context(user, type as ImportType, { classId, examId });
    return this.imports.describe(spec, ctx);
  }

  /** File mẫu .xlsx */
  @Get(':type/template')
  @RequirePermissions(PMS.CLS_AD, PMS.EXAM_AD)
  async template(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query('classId') classId?: string,
    @Query('examId') examId?: string,
  ) {
    const spec = this.imports.spec(type);
    const ctx = await this.imports.context(user, type as ImportType, { classId, examId });
    const buffer = await buildTemplate(spec, ctx);
    const suffix = ctx.examTitle ?? ctx.className;
    return fileResponse(buffer, `Mẫu - ${spec.title}${suffix ? ' - ' + safeFileName(suffix) : ''}.xlsx`);
  }
}
