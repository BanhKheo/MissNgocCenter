import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { MAX_TEXT_ANSWER, PMS } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../../common/decorators';
import { MAX_UPLOAD_BYTES } from '../../../common/images';
import { parseIfMatch, ReviewService } from '../services/review.service';
import { SubmissionsService } from '../services/submissions.service';

class AbsentRequestDto {
  @ApiProperty()
  @IsBoolean()
  absent: boolean;
}

class MoveImageRequestDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;
}

class AnswerUpdateRequestDto {
  @ApiProperty({ type: String, nullable: true, description: 'Chữ cái (trắc nghiệm) hoặc chữ học sinh viết (điền từ). null = bỏ trống' })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MAX_TEXT_ANSWER)
  finalChoice: string | null;
}

class SubmissionUpdateRequestDto {
  @ApiPropertyOptional({ description: 'Mã đề; chuỗi rỗng là mã đề chung' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]{0,10}$/)
  versionCode?: string;
}

@ApiTags('submissions')
@ApiBearerAuth()
@Controller()
export class SubmissionsController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly review: ReviewService,
  ) {}

  @Get('exams/:examId/submissions')
  @RequirePermissions(PMS.GRD_USER, PMS.EXAM_AD, PMS.RPT_AD, PMS.RPT_USER)
  list(@CurrentUser() user: AuthUser, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.submissions.listForExam(user, examId);
  }

  @Post('exams/:examId/submissions/:studentId/images')
  @RequirePermissions(PMS.GRD_USER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.submissions.uploadImage(user, examId, studentId, file);
  }

  @Put('exams/:examId/submissions/:studentId/absent')
  @RequirePermissions(PMS.GRD_USER)
  absent(
    @CurrentUser() user: AuthUser,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: AbsentRequestDto,
  ) {
    return this.submissions.setAbsent(user, examId, studentId, body.absent);
  }

  @Get('submissions/:id')
  @RequirePermissions(PMS.GRD_USER, PMS.EXAM_AD, PMS.RPT_AD, PMS.RPT_USER)
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.submissions.detail(user, id);
  }

  /** Sửa mã đề. Header If-Match: version */
  @Patch('submissions/:id')
  @RequirePermissions(PMS.GRD_USER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SubmissionUpdateRequestDto,
  ) {
    if (body.versionCode === undefined) return this.submissions.detail(user, id);
    return this.review.setVersionCode(user, id, body.versionCode, parseIfMatch(ifMatch));
  }

  /** Sửa 1 câu khi duyệt. Header If-Match: version; 412 nếu người khác vừa sửa */
  @Patch('submissions/:id/answers/:questionNo')
  @RequirePermissions(PMS.GRD_USER)
  updateAnswer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionNo', ParseIntPipe) questionNo: number,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AnswerUpdateRequestDto,
  ) {
    return this.review.updateAnswer(user, id, questionNo, body.finalChoice, parseIfMatch(ifMatch));
  }

  @Post('submissions/:id/confirm')
  @HttpCode(200)
  @RequirePermissions(PMS.GRD_USER)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.review.confirm(user, id, parseIfMatch(ifMatch));
  }

  /** Trả ảnh qua endpoint có kiểm tra quyền; ảnh không nằm trong thư mục web */
  @Get('submission-images/:id/file')
  @RequirePermissions(PMS.GRD_USER, PMS.EXAM_AD, PMS.RPT_AD, PMS.RPT_USER)
  async image(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const img = await this.submissions.readImage(user, id);
    return new StreamableFile(img.stream, { type: img.mimeType, length: img.size, disposition: 'inline' });
  }

  @Delete('submission-images/:id')
  @RequirePermissions(PMS.GRD_USER)
  deleteImage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.submissions.deleteImage(user, id);
  }

  @Post('submission-images/:id/move')
  @HttpCode(200)
  @RequirePermissions(PMS.GRD_USER)
  moveImage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: MoveImageRequestDto) {
    return this.submissions.moveImage(user, id, body.studentId);
  }
}
