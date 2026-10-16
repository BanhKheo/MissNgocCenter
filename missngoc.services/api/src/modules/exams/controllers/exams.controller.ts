import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../../common/decorators';
import { MAX_IMPORT_BYTES } from '../../imports/workbook';
import { AnswerKeyPutRequestDto, ExamCreateRequestDto, ExamFilterRequestDto, ExamUpdateRequestDto } from '../dto/exam.dto';
import { AnswerKeysService } from '../services/answer-keys.service';
import { ExamsService } from '../services/exams.service';

const VIEW_EXAMS = [PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER, PMS.CLS_AD];

@ApiTags('exams')
@ApiBearerAuth()
@Controller('exams')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly keys: AnswerKeysService,
  ) {}

  @Get()
  @RequirePermissions(...VIEW_EXAMS)
  list(@CurrentUser() user: AuthUser, @Query() q: ExamFilterRequestDto) {
    return this.exams.list(user, q);
  }

  @Get(':id')
  @RequirePermissions(...VIEW_EXAMS)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.exams.get(user, id);
  }

  @Post()
  @RequirePermissions(PMS.EXAM_AD)
  create(@CurrentUser() user: AuthUser, @Body() body: ExamCreateRequestDto) {
    return this.exams.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PMS.EXAM_AD)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ExamUpdateRequestDto) {
    return this.exams.update(user, id, body);
  }

  @Get(':id/answer-keys')
  @RequirePermissions(PMS.EXAM_AD, PMS.GRD_USER)
  listKeys(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.keys.list(user, id);
  }

  /** Ghi đè đáp án của một mã đề. Mã đề chung (bài chỉ có 1 mã đề) viết là "_" */
  @Put(':id/answer-keys/:versionCode')
  @RequirePermissions(PMS.EXAM_AD)
  putKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionCode') versionCode: string,
    @Body() body: AnswerKeyPutRequestDto,
  ) {
    return this.keys.put(user, id, versionCode, body.items);
  }

  @Delete(':id/answer-keys/:versionCode')
  @HttpCode(204)
  @RequirePermissions(PMS.EXAM_AD)
  async deleteKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionCode') versionCode: string,
  ) {
    await this.keys.remove(user, id, versionCode);
  }

  @Post(':id/answer-keys/import')
  @HttpCode(200)
  @RequirePermissions(PMS.EXAM_AD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  importKeys(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun: boolean | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.keys.import(user, id, file, dryRun ?? true);
  }
}
