/**
 * populate-name-fields.ts
 *
 * One-time idempotent migration: split existing users' displayName into
 * firstName / secondName / lastName using parseDisplayName(), then recompute
 * displayName via computeDisplayName() for consistency.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx ts-node -r tsconfig-paths/register \
 *     apps/auth-service/src/app/migrations/populate-name-fields.ts
 *
 * The script is idempotent: rows where firstName IS NOT NULL are skipped.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from '../entities/user.entity.js';
import { computeDisplayName, parseDisplayName } from '../utils/display-name.js';

// ── Exported migration runner (also used in tests) ────────────────────────────

export interface MigrationResult {
  processed: number;
  skipped: number;
  errors: number;
}

/**
 * Run the name-field population against an open DataSource.
 * The caller is responsible for initialising and destroying the DataSource.
 */
export async function populateNameFields(dataSource: DataSource): Promise<MigrationResult> {
  const repo = dataSource.getRepository(UserEntity);

  // Load all users where firstName is not yet populated (idempotency guard).
  const users = await repo.find({ where: { firstName: undefined as unknown as string } });

  let processed = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const user of users) {
    // Extra guard — skip rows that somehow slipped through the WHERE clause.
    if (user.firstName != null) {
      skipped++;
      continue;
    }

    try {
      const parsed = parseDisplayName(user.displayName ?? '');

      user.firstName  = parsed.firstName  ?? undefined;
      user.secondName = parsed.secondName ?? undefined;
      user.lastName   = parsed.lastName   ?? undefined;

      // Recompute displayName from structured fields for consistency.
      // If parsing produced nothing (e.g. empty displayName), fall back to
      // the email local-part so displayName is never nulled out for active users.
      const recomputed = computeDisplayName(
        parsed.firstName,
        parsed.secondName,
        parsed.lastName,
      );
      if (recomputed !== null) {
        user.displayName = recomputed;
      }
      // If recomputed is null and displayName was already null, leave as-is.

      await repo.save(user);
      processed++;
    } catch (err) {
      errors++;
      console.error(`[migrate] Error processing user ${user.id}:`, err);
    }
  }

  console.log(
    `[migrate] populate-name-fields complete — ` +
    `processed: ${processed}, skipped: ${skipped}, errors: ${errors}`,
  );

  return { processed, skipped, errors };
}

// ── CLI entry-point ───────────────────────────────────────────────────────────

/* istanbul ignore next */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type:        'postgres',
    url:         databaseUrl,
    entities:    [UserEntity],
    synchronize: false, // Never auto-sync in a migration script
    ssl:         process.env['NODE_ENV'] === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });

  await dataSource.initialize();
  try {
    await populateNameFields(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Run when executed directly (not when imported as a module in tests).
/* istanbul ignore next */
const isMain = process.argv[1]?.endsWith('populate-name-fields.ts') ||
               process.argv[1]?.endsWith('populate-name-fields.js');
/* istanbul ignore next */
if (isMain) {
  main().catch((err) => {
    console.error('[migrate] Fatal error:', err);
    process.exit(1);
  });
}