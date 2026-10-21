import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);
const COLOR = /^#[0-9A-Fa-f]{6}$/;

export class GradebookQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['json', 'xlsx'] })
  @IsOptional()
  @IsString()
  format?: string;
}

export class SessionCreateRequestDto {
  @ApiProperty({ example: '2026-10-10' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Unit 2 lesson 3' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SessionUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class AttendanceItemDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã điểm danh theo mẫu sổ điểm; null là xoá; bỏ trống là giữ nguyên' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4)
  status?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã bài tập về nhà; null là xoá; bỏ trống là giữ nguyên' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4)
  homework?: string | null;
}

export class AttendancePutRequestDto {
  @ApiProperty({ type: [AttendanceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  items: AttendanceItemDto[];
}

export class ScorePutRequestDto {
  @ApiProperty({ type: Number, nullable: true, example: 7.5, description: 'null là xoá điểm' })
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  score: number | null;

  @ApiPropertyOptional({ description: 'Vắng: không tính vào điểm trung bình' })
  @IsOptional()
  @IsBoolean()
  absent?: boolean;
}

export class CategoryCreateRequestDto {
  @ApiProperty({ example: 'Cuối unit' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight: number;

  @ApiPropertyOptional({ example: '#FFD966' })
  @IsOptional()
  @Matches(COLOR)
  headerFill?: string;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @Matches(COLOR)
  headerFont?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class CategoryUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(COLOR)
  headerFill?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(COLOR)
  headerFont?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class GradebookTemplatePutRequestDto {
  @ApiProperty({ type: Object })
  @IsObject()
  config: Record<string, unknown>;
}
