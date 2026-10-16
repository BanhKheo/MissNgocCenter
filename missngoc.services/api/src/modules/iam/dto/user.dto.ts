import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination';
import { PASSWORD_MIN_LENGTH } from '../../auth/password';

const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);

export class UserCreateRequestDto {
  @ApiProperty({ example: 'giaovu.lan', description: 'Chữ thường, số, dấu chấm; 3–30 ký tự' })
  @Transform(trimLower)
  @Matches(/^[a-z0-9.]{3,30}$/, { message: 'Username chỉ gồm chữ thường, số, dấu chấm; dài 3–30 ký tự' })
  username: string;

  @ApiProperty({ example: 'Nguyễn Thị Lan' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty()
  @IsUUID()
  roleId: string;

  @ApiProperty({ description: 'Mật khẩu tạm, người dùng phải đổi ở lần đăng nhập đầu' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự` })
  @MaxLength(200)
  password: string;
}

export class UserUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'BANNED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'BANNED'])
  status?: 'ACTIVE' | 'BANNED';
}

export class PasswordResetRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự` })
  @MaxLength(200)
  password: string;
}

export class UserFilterRequestDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'BANNED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'BANNED'])
  status?: 'ACTIVE' | 'BANNED';
}
