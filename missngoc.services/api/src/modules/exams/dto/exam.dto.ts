import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_TEXT_ANSWER, OPTION_SETS, QUESTION_KINDS, type QuestionKind } from '@missngoc/core';
import { PageQueryDto } from '../../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);

export class ExamCreateRequestDto {
  @ApiProperty()
  @IsUUID()
  classId: string;

  @ApiProperty({ example: 'Kiểm tra giữa kỳ Unit 1–4' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: '2026-10-20' })
  @IsDateString()
  examDate: string;

  @ApiProperty({ example: 40 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  questionCount: number;

  @ApiProperty({ enum: OPTION_SETS, example: 'ABCD' })
  @IsIn(OPTION_SETS)
  options: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @ApiPropertyOptional({ example: '40 câu, 2 cột, mỗi câu 4 ô A–D' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  layoutHint?: string;
}

export class ExamUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  examDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  questionCount?: number;

  @ApiPropertyOptional({ enum: OPTION_SETS })
  @IsOptional()
  @IsIn(OPTION_SETS)
  options?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  layoutHint?: string;

  @ApiPropertyOptional({ enum: ['OPEN', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['OPEN', 'ARCHIVED'])
  status?: 'OPEN' | 'ARCHIVED';
}

export class ExamFilterRequestDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ enum: ['OPEN', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['OPEN', 'ARCHIVED'])
  status?: 'OPEN' | 'ARCHIVED';
}

export class AnswerKeyItemDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  q: number;

  @ApiPropertyOptional({ enum: QUESTION_KINDS, example: 'choice', description: 'Không gửi thì là trắc nghiệm' })
  @IsOptional()
  @IsIn(QUESTION_KINDS)
  kind?: QuestionKind;

  @ApiProperty({ type: [String], example: ['B'], description: 'Trắc nghiệm: chữ cái đúng. Điền từ: các cách viết được chấp nhận' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(MAX_TEXT_ANSWER, { each: true })
  correct: string[];

  @ApiPropertyOptional({ example: 0.25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  points?: number;
}

export class AnswerKeyPutRequestDto {
  @ApiProperty({ type: [AnswerKeyItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerKeyItemDto)
  items: AnswerKeyItemDto[];
}
