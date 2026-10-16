import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/* istanbul ignore next */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateUserNameDto {
  @ApiPropertyOptional({ description: 'First name (max 100 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Second / middle name (max 100 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  secondName?: string;

  @ApiPropertyOptional({ description: 'Last name (max 100 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  lastName?: string;
}