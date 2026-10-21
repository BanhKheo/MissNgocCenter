import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { fileResponse, safeFileName } from '../../common/files';
import { CategoriesService } from './categories.service';
import {
  AttendancePutRequestDto,
  CategoryCreateRequestDto,
  CategoryUpdateRequestDto,
  GradebookQueryDto,
  GradebookTemplatePutRequestDto,
  ScorePutRequestDto,
  SessionCreateRequestDto,
  SessionUpdateRequestDto,
} from './gradebook.dto';
import { GradebookService } from './gradebook.service';
import { buildGradebookWorkbook } from './gradebook-xlsx';

const VIEW = [PMS.CLS_AD, PMS.ATT_USER, PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER];
/** Điểm danh, bài tập, nhập điểm tay: giáo viên (lớp mình dạy) và giáo vụ */
const EDIT = [PMS.ATT_USER, PMS.GRD_USER];

@ApiTags('gradebook')
@ApiBearerAuth()
@Controller()
export class GradebookController {
  constructor(
    private readonly gradebook: GradebookService,
    private readonly categories: CategoriesService,
  ) {}

  /** Sổ điểm của lớp (JSON cho web); ?format=xlsx xuất chính lưới đó ra Excel */
  @Get('classes/:id/gradebook')
  @RequirePermissions(...VIEW)
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: GradebookQueryDto) {
    const g = await this.gradebook.build(user, id, q.from, q.to);
    if (q.format !== 'xlsx') return g;
    return fileResponse(await buildGradebookWorkbook(g), `Sổ điểm - ${safeFileName(g.title)}.xlsx`);
  }

  @Post('classes/:id/sessions')
  @RequirePermissions(...EDIT)
  createSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: SessionCreateRequestDto) {
    return this.gradebook.createSession(user, id, body.date, body.note);
  }

  @Patch('class-sessions/:id')
  @RequirePermissions(...EDIT)
  updateSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: SessionUpdateRequestDto) {
    return this.gradebook.updateSession(user, id, body);
  }

  @Delete('class-sessions/:id')
  @RequirePermissions(...EDIT)
  deleteSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gradebook.deleteSession(user, id);
  }

  /** Điểm danh, bài tập của nhiều học sinh trong một buổi (ví dụ "Tất cả có mặt") */
  @Put('class-sessions/:id/attendance')
  @RequirePermissions(...EDIT)
  setAttendance(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AttendancePutRequestDto) {
    return this.gradebook.setAttendance(user, id, body.items);
  }

  /** Nhập điểm tay cho bài kiểm tra dạng "Nhập điểm tay" */
  @Put('exams/:examId/scores/:studentId')
  @RequirePermissions(...EDIT)
  setScore(
    @CurrentUser() user: AuthUser,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: ScorePutRequestDto,
  ) {
    return this.gradebook.setScore(user, examId, studentId, body);
  }

  @Get('assessment-categories')
  @RequirePermissions(PMS.SYS_AD, ...VIEW)
  listCategories() {
    return this.categories.list();
  }

  @Post('assessment-categories')
  @RequirePermissions(PMS.SYS_AD)
  createCategory(@CurrentUser() user: AuthUser, @Body() body: CategoryCreateRequestDto) {
    return this.categories.create(user, body);
  }

  @Patch('assessment-categories/:id')
  @RequirePermissions(PMS.SYS_AD)
  updateCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: CategoryUpdateRequestDto) {
    return this.categories.update(user, id, body);
  }

  @Delete('assessment-categories/:id')
  @RequirePermissions(PMS.SYS_AD)
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(user, id);
  }

  @Get('gradebook-template')
  @RequirePermissions(PMS.SYS_AD, ...VIEW)
  template() {
    return this.gradebook.template();
  }

  @Put('gradebook-template')
  @RequirePermissions(PMS.SYS_AD)
  saveTemplate(@CurrentUser() user: AuthUser, @Body() body: GradebookTemplatePutRequestDto) {
    return this.gradebook.saveTemplate(user, body.config);
  }
}
