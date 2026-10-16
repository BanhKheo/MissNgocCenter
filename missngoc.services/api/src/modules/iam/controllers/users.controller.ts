import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../../common/decorators';
import {
  PasswordResetRequestDto,
  UserCreateRequestDto,
  UserFilterRequestDto,
  UserUpdateRequestDto,
} from '../dto/user.dto';
import { UsersService } from '../services/users.service';

@ApiTags('iam')
@ApiBearerAuth()
@Controller('iam/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PMS.USER_AD)
  list(@Query() q: UserFilterRequestDto) {
    return this.users.list(q);
  }

  // Giáo vụ (CLS.AD) cần danh sách người dùng để chọn giáo viên cho lớp
  @Get('options')
  @RequirePermissions(PMS.USER_AD, PMS.CLS_AD)
  options(@Query('keyword') keyword?: string) {
    return this.users.options(keyword);
  }

  @Get(':id')
  @RequirePermissions(PMS.USER_AD)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions(PMS.USER_AD)
  create(@CurrentUser() actor: AuthUser, @Body() body: UserCreateRequestDto) {
    return this.users.create(actor, body);
  }

  @Patch(':id')
  @RequirePermissions(PMS.USER_AD)
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UserUpdateRequestDto) {
    return this.users.update(actor, id, body);
  }

  @Post(':id/password-reset')
  @HttpCode(204)
  @RequirePermissions(PMS.USER_AD)
  async resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PasswordResetRequestDto,
  ) {
    await this.users.resetPassword(actor, id, body);
  }
}
