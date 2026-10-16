import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../../common/decorators';
import { ClassCreateRequestDto, ClassFilterRequestDto, ClassUpdateRequestDto } from '../dto/class.dto';
import { ClassesService } from '../services/classes.service';

const VIEW_CLASSES = [PMS.CLS_AD, PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER];

@ApiTags('classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @RequirePermissions(...VIEW_CLASSES)
  list(@CurrentUser() user: AuthUser, @Query() q: ClassFilterRequestDto) {
    return this.classes.list(user, q);
  }

  @Get('options')
  @RequirePermissions(...VIEW_CLASSES)
  options(@CurrentUser() user: AuthUser, @Query('keyword') keyword?: string) {
    return this.classes.options(user, keyword);
  }

  @Get(':id')
  @RequirePermissions(...VIEW_CLASSES)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.classes.get(user, id);
  }

  @Post()
  @RequirePermissions(PMS.CLS_AD)
  create(@CurrentUser() user: AuthUser, @Body() body: ClassCreateRequestDto) {
    return this.classes.create(user, body);
  }

  // Lưu trữ lớp: PATCH { status: 'ARCHIVED' }. Không xoá để giữ lịch sử điểm.
  @Patch(':id')
  @RequirePermissions(PMS.CLS_AD)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ClassUpdateRequestDto) {
    return this.classes.update(user, id, body);
  }
}
