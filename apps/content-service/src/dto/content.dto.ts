import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsUrl,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { CONTENT_STATUSES, type ContentStatus, type Direction, DIRECTIONS, TOPIC_KINDS, type TopicKind } from '../interfaces/content.interfaces.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A YouTube page or short link (the web client turns it into a privacy-enhanced embed). */
export const YOUTUBE_URL = /^https:\/\/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{6,}/;

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

  @ApiPropertyOptional({ enum: TOPIC_KINDS, default: 'pictures' })
  @IsOptional()
  @IsIn(TOPIC_KINDS)
  kind?: TopicKind;
}

export class UpdateTopicDto {
  @ApiPropertyOptional({ maxLength: 120, description: 'required in the default language; empty in another removes its translation' })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ enum: TOPIC_KINDS })
  @IsOptional()
  @IsIn(TOPIC_KINDS)
  kind?: TopicKind;

  @ApiPropertyOptional({ maxLength: 20000, nullable: true, description: 'text / book / movie pages; see TopicDetailView.body for the markup' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true, description: 'book pages: "Label: value" lines' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  details?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, description: 'book pages: http(s) link for the buy button' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  buyUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 60, nullable: true, description: 'book pages: buy button text' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  buyLabel?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, description: 'movie pages: a YouTube link', example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(YOUTUBE_URL, { message: 'videoUrl must be a YouTube link (youtube.com/watch?v=…, youtu.be/…, or a shorts / embed / live link)' })
  @MaxLength(500)
  videoUrl?: string | null;

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

export class ChangeOwnerDto {
  @ApiProperty({ example: 'cousin@gmail.com', description: 'must already be an editor' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class UpdatePageDto {
  @ApiProperty({
    maxLength: 10000,
    description: 'plain text; blank lines separate paragraphs. Required in the default language; empty in another removes its translation',
  })
  @IsString()
  @MaxLength(10000)
  body!: string;
}

export class UpdateSiteDto {
  @ApiProperty({ maxLength: 60, description: 'required in the default language; empty in another removes its translation' })
  @IsString()
  @MaxLength(60)
  title!: string;

  @ApiProperty({ maxLength: 120, description: 'may be empty' })
  @IsString()
  @MaxLength(120)
  tagline!: string;
}

const LANG_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/;
const LABEL_KEY = /^[a-zA-Z][a-zA-Z0-9.]{0,59}$/;
export const MAX_LABELS = 300;
export const MAX_LABEL_LENGTH = 500;

/** A map of label key → text: at most 300 keys, each text at most 500 characters. */
export function isLabelMap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_LABELS &&
    entries.every(([key, text]) => LABEL_KEY.test(key) && typeof text === 'string' && text.length <= MAX_LABEL_LENGTH)
  );
}

export class CreateLanguageDto {
  @ApiProperty({ maxLength: 20, example: 'he', description: 'lower-case language tag, e.g. en, he, pt-br' })
  @Matches(LANG_CODE, { message: 'code must be a lower-case language tag such as en, he or pt-br' })
  @MaxLength(20)
  code!: string;

  @ApiProperty({ maxLength: 40, example: 'עברית', description: 'shown in the language switcher' })
  @IsString()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(40)
  name!: string;

  @ApiProperty({ enum: DIRECTIONS })
  @IsIn(DIRECTIONS)
  direction!: Direction;
}

export class UpdateLanguageDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @ValidateIf((_, v) => v !== undefined) // unlike @IsOptional, rejects null
  @IsString()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional({ enum: DIRECTIONS })
  @ValidateIf((_, v) => v !== undefined) // unlike @IsOptional, rejects null
  @IsIn(DIRECTIONS)
  direction?: Direction;

  @ApiPropertyOptional({ enum: [true], description: 'make this the default language' })
  @ValidateIf((_, v) => v !== undefined) // unlike @IsOptional, rejects null
  @IsIn([true])
  isDefault?: true;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' }, description: 'label key → text; replaces all overrides' })
  @ValidateIf((_, v) => v !== undefined) // unlike @IsOptional, rejects null
  @ValidateBy({
    name: 'isLabelMap',
    validator: {
      validate: isLabelMap,
      defaultMessage: (): string => `labels must map up to ${MAX_LABELS} label keys to text of at most ${MAX_LABEL_LENGTH} characters`,
    },
  })
  labels?: Record<string, string>;
}
