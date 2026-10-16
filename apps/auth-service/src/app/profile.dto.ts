import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/* istanbul ignore next */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Body for `PATCH /auth/profile` — the signed-in user's self-service profile
 * update. The user ID is derived from the access token; the body
 * MUST NOT carry an id. `displayName` is recomputed server-side from the name
 * fields per the spec-103 formula and is not user-settable.
 */
export class UpdateProfileDto {
  @ApiProperty({ description: 'First name (1–100 chars, trimmed)' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'firstName must not be empty' })
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional({
    description: 'Middle / second name (max 100 chars, trimmed). Empty string clears the field.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  secondName?: string;

  @ApiProperty({ description: 'Last name (1–100 chars, trimmed)' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'lastName must not be empty' })
  @MaxLength(100)
  lastName!: string;
}
