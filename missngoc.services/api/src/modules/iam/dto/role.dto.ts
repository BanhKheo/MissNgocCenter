import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RoleCreateRequestDto {
  @ApiProperty({ example: 'GIAOVU_GIAOVIEN', description: 'Chữ in hoa, số, gạch dưới' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { message: 'Tên vai trò gồm chữ in hoa, số, gạch dưới; bắt đầu bằng chữ' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ type: [String], example: ['GRD.USER', 'RPT.AD'], description: 'Mã quyền' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}

export class RoleUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}
