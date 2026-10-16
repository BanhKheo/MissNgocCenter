import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { fileResponse, safeFileName } from '../../common/files';
import { buildReportWorkbook } from './report-xlsx';
import { ReportsService } from './reports.service';

class ReportTemplatePutRequestDto {
  @ApiProperty({ type: Object })
  @IsObject()
  config: Record<string, unknown>;
}

const VIEW_REPORTS = [PMS.RPT_AD, PMS.RPT_USER];

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Lưới bảng điểm (JSON) cho Antd Table; ?format=xlsx xuất chính lưới đó ra Excel */
  @Get('exams/:examId/report')
  @RequirePermissions(...VIEW_REPORTS)
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'xlsx'] })
  async report(
    @CurrentUser() user: AuthUser,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Query('format') format?: string,
  ) {
    const grid = await this.reports.grid(user, examId);
    if (format !== 'xlsx') return grid;
    const stats = await this.reports.stats(user, examId);
    const meta = await this.reports.examMeta(user, examId);
    const buffer = await buildReportWorkbook(grid, stats);
    return fileResponse(buffer, `Bảng điểm - ${safeFileName(meta.className)} - ${safeFileName(meta.title)}.xlsx`);
  }

  @Get('exams/:examId/stats')
  @RequirePermissions(...VIEW_REPORTS)
  stats(@CurrentUser() user: AuthUser, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.reports.stats(user, examId);
  }

  @Get('report-templates/default')
  @RequirePermissions(PMS.SYS_AD, ...VIEW_REPORTS)
  template() {
    return this.reports.template();
  }

  @Put('report-templates/default')
  @RequirePermissions(PMS.SYS_AD)
  saveTemplate(@CurrentUser() user: AuthUser, @Body() body: ReportTemplatePutRequestDto) {
    return this.reports.saveTemplate(user, body.config);
  }
}
