import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PMS } from '@missngoc/core';
import type { AuthUser } from '../../../common/auth-user';
import { CurrentUser, RequirePermissions } from '../../../common/decorators';
import { RoleCreateRequestDto, RoleUpdateRequestDto } from '../dto/role.dto';
import { RolesService } from '../services/roles.service';

@ApiTags('iam')
@ApiBearerAuth()
@Controller('iam')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermissions(PMS.USER_AD)
  list() {
    return this.roles.list();
  }

  @Get('roles/options')
  @RequirePermissions(PMS.USER_AD)
  options() {
    return this.roles.options();
  }

  @Get('roles/:id')
  @RequirePermissions(PMS.USER_AD)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.get(id);
  }

  @Post('roles')
  @RequirePermissions(PMS.USER_AD)
  create(@CurrentUser() actor: AuthUser, @Body() body: RoleCreateRequestDto) {
    return this.roles.create(actor, body);
  }

  @Put('roles/:id')
  @RequirePermissions(PMS.USER_AD)
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: RoleUpdateRequestDto) {
    return this.roles.update(actor, id, body);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions(PMS.USER_AD)
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.roles.remove(actor, id);
  }

  @Get('permissions')
  @RequirePermissions(PMS.USER_AD)
  permissions() {
    return this.roles.allPermissions();
  }
}
