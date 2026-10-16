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
import { StudentCreateRequestDto, StudentTransferRequestDto, StudentUpdateRequestDto } from '../dto/student.dto';
import { StudentsService } from '../services/students.service';

@ApiTags('students')
@ApiBearerAuth()
@Controller()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('classes/:classId/students')
  @RequirePermissions(PMS.CLS_AD, PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER)
  list(@CurrentUser() user: AuthUser, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.students.listInClass(user, classId);
  }

  @Post('classes/:classId/students')
  @RequirePermissions(PMS.CLS_AD)
  create(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: StudentCreateRequestDto,
  ) {
    return this.students.create(user, classId, body);
  }

  @Post('classes/:classId/students/import')
  @HttpCode(200)
  @RequirePermissions(PMS.CLS_AD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  import(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun: boolean | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.students.import(user, classId, file, dryRun ?? true);
  }

  @Post('classes/:classId/students/:studentId/transfer')
  @HttpCode(204)
  @RequirePermissions(PMS.CLS_AD)
  async transfer(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: StudentTransferRequestDto,
  ) {
    await this.students.transfer(user, classId, studentId, body.toClassId);
  }

  @Delete('classes/:classId/students/:studentId')
  @HttpCode(204)
  @RequirePermissions(PMS.CLS_AD)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.students.removeFromClass(user, classId, studentId);
  }

  @Patch('students/:id')
  @RequirePermissions(PMS.CLS_AD)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: StudentUpdateRequestDto) {
    return this.students.update(user, id, body);
  }
}
