import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class StudentCreateRequestDto {
  @ApiPropertyOptional({ example: 'HS0001', description: 'Trống thì hệ thống tự tạo' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9._-]{1,30}$/, { message: 'Mã HS chỉ gồm chữ không dấu, số, dấu chấm, gạch' })
  studentCode?: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiPropertyOptional({ example: '2014-09-05', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dob?: string | null;

  @ApiPropertyOptional({ example: '0912345678', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^0\d{9}$/, { message: 'SĐT cần 10 chữ số, bắt đầu bằng 0' })
  parentPhone?: string | null;
}

export class StudentUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9._-]{1,30}$/, { message: 'Mã HS chỉ gồm chữ không dấu, số, dấu chấm, gạch' })
  studentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dob?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^0\d{9}$/, { message: 'SĐT cần 10 chữ số, bắt đầu bằng 0' })
  parentPhone?: string | null;
}

export class StudentTransferRequestDto {
  @ApiProperty()
  @IsUUID()
  toClassId: string;
}
