import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../../common/decorators';
import { GradingRunsService } from '../services/grading-runs.service';

class GradingRunCreateRequestDto {
  @ApiPropertyOptional({ default: false, description: 'Chấm lại cả bài đã chấm' })
  @IsOptional()
  @IsBoolean()
  regrade?: boolean;
}

// Generate không phải CRUD: mô hình hoá thành tạo tài nguyên grading-runs. Trả 202 vì chấm chạy nền.
@ApiTags('grading')
@ApiBearerAuth()
@Controller('exams/:examId/grading-runs')
export class GradingRunsController {
  constructor(private readonly runs: GradingRunsService) {}

  @Post()
  @HttpCode(202)
  @RequirePermissions(PMS.GRD_USER)
  create(
    @CurrentUser() user: AuthUser,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() body: GradingRunCreateRequestDto,
  ) {
    return this.runs.create(user, examId, body.regrade ?? false);
  }

  @Get('latest')
  @RequirePermissions(PMS.GRD_USER, PMS.EXAM_AD)
  latest(@CurrentUser() user: AuthUser, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.runs.latest(user, examId);
  }

  /** Tiến độ lượt chấm; giao diện hỏi mỗi 2 giây */
  @Get(':runId')
  @RequirePermissions(PMS.GRD_USER, PMS.EXAM_AD)
  progress(
    @CurrentUser() user: AuthUser,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.runs.progress(user, examId, runId);
  }
}
