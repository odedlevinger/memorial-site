import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CONTENT_STATUSES, type ContentStatus } from '../interfaces/content.interfaces.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateTopicDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class UpdateTopicDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: 140, description: 'lower-case words joined by dashes' })
  @IsOptional()
  @Matches(SLUG, { message: 'slug must be lower-case letters, digits and dashes' })
  @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: CONTENT_STATUSES })
  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional({ nullable: true, description: 'id of one of this topic’s pictures' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  coverPictureId?: string | null;
}

export class OrderDto {
  @ApiProperty({ type: [String], description: 'ids in the desired order' })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class UpdatePictureDto {
  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  caption?: string | null;

  @ApiPropertyOptional({ maxLength: 60, nullable: true, example: 'Summer 1974' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  dateText?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  place?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  story?: string | null;

  @ApiPropertyOptional({ enum: CONTENT_STATUSES })
  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'move the picture to another topic' })
  @IsOptional()
  @IsUUID()
  topicId?: string;
}

export class AddEditorDto {
  @ApiProperty({ example: 'cousin@gmail.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
