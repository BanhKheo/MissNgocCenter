import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PMS } from '@missngoc/core';
import { RequirePermissions } from '../../common/decorators';
import { PageQueryDto } from '../../common/pagination';
import { AuditService } from './audit.service';

class AuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PMS.SYS_AD)
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}
