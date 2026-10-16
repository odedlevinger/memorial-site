import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

/**
 * Request body for both grant (`POST /admin/users/:id/admin-role`) and
 * revoke (`DELETE /admin/users/:id/admin-role`) endpoints (feature 235).
 *
 * `actorUserId` is the verified UUID of the back-office Admin who initiated
 * the change, taken from the JWT by the calling admin client and forwarded here.
 * The literal string `'rollout-migration'` is accepted for the one-time
 * rollout seed in feature 235.
 */
export class GrantRevokeRequestDto {
  /**
   * Either a UUID (string of length 36 matching the UUID v4 pattern) or
   * the literal `'rollout-migration'`. The Matches regex covers both.
   */
  @IsString()
  @Matches(
    /^(rollout-migration|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
    { message: 'actorUserId must be a UUID or the literal "rollout-migration"' },
  )
  actorUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
