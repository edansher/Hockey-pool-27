import type { NhlSourceFeeds } from "./nhl-source-parser";

export interface NhlRawGamePayload {
  boxscore: unknown;
  playByPlay: unknown;
}

export type NhlRawPayloads = Record<string, NhlRawGamePayload>;

export interface NhlSourceCacheRecord {
  snapshot: NhlSourceFeeds | null;
  rawPayloads: NhlRawPayloads;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  error: string | null;
  refreshing: boolean;
  leaseExpiresAt: string | null;
}

export interface NhlSourceStore {
  read(): Promise<NhlSourceCacheRecord | null>;
  claim(token: string, cooldownMs: number, leaseMs: number): Promise<boolean>;
  succeed(token: string, feeds: NhlSourceFeeds, rawPayloads: NhlRawPayloads): Promise<void>;
  fail(token: string, safeError: string): Promise<void>;
}

export interface NhlPoolScoringArchiveRecord {
  snapshot: unknown;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
}

export interface NhlPoolScoringArchiveStore {
  read(): Promise<NhlPoolScoringArchiveRecord | null>;
  succeed(snapshot: unknown): Promise<void>;
  progress(snapshot: unknown, safeError: string): Promise<void>;
  fail(safeError: string): Promise<void>;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function database() {
  const [drizzle, workspaceDb] = await Promise.all([
    import("drizzle-orm"),
    import("@workspace/db"),
  ]);
  return { sql: drizzle.sql, db: workspaceDb.db, table: workspaceDb.nhlSourceCacheTable };
}

export const postgresNhlSourceStore: NhlSourceStore = {
  async read() {
    const { db, sql, table } = await database();
    const [row] = await db
      .select()
      .from(table)
      .where(sql`${table.id} = 1`)
      .limit(1);
    if (!row) return null;
    return {
      snapshot: row.snapshot as NhlSourceFeeds | null,
      rawPayloads: row.rawPayloads as NhlRawPayloads,
      lastAttemptAt: iso(row.lastAttemptAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      nextRefreshAt: iso(row.nextRefreshAt),
      error: row.error,
      refreshing: row.refreshing,
      leaseExpiresAt: iso(row.leaseExpiresAt),
    };
  },

  async claim(token, cooldownMs, leaseMs) {
    const { db, sql } = await database();
    const result = await db.execute(sql`
      INSERT INTO nhl_source_cache (
        id, snapshot, raw_payloads, last_attempt_at, last_success_at,
        next_refresh_at, error, refreshing, lease_token, lease_expires_at
      )
      VALUES (
        1, NULL, '{}'::jsonb, statement_timestamp(), NULL,
        statement_timestamp() + (${cooldownMs} * interval '1 millisecond'),
        NULL, true, ${token},
        statement_timestamp() + (${leaseMs} * interval '1 millisecond')
      )
      ON CONFLICT (id) DO UPDATE SET
        last_attempt_at = statement_timestamp(),
        next_refresh_at = statement_timestamp() + (${cooldownMs} * interval '1 millisecond'),
        refreshing = true,
        lease_token = EXCLUDED.lease_token,
        lease_expires_at = statement_timestamp() + (${leaseMs} * interval '1 millisecond')
      WHERE
        (nhl_source_cache.lease_expires_at IS NULL OR nhl_source_cache.lease_expires_at <= clock_timestamp())
        AND (nhl_source_cache.next_refresh_at IS NULL OR nhl_source_cache.next_refresh_at <= clock_timestamp())
      RETURNING id
    `);
    return result.rows.length > 0;
  },

  async succeed(token, feeds, rawPayloads) {
    const { db, sql, table } = await database();
    await db
      .update(table)
      .set({
        snapshot: feeds,
        rawPayloads,
        lastSuccessAt: new Date(),
        error: null,
        refreshing: false,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(sql`${table.id} = 1 AND ${table.leaseToken} = ${token}`);
  },

  async fail(token, safeError) {
    const { db, sql, table } = await database();
    await db
      .update(table)
      .set({
        error: safeError,
        refreshing: false,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(sql`${table.id} = 1 AND ${table.leaseToken} = ${token}`);
  },
};

/**
 * The normalized season archive is isolated in its own cache row (id 2);
 * rolling today/yesterday source data remains untouched in row id 1.
 */
export const postgresNhlPoolScoringArchiveStore: NhlPoolScoringArchiveStore = {
  async read() {
    const { db, sql, table } = await database();
    const [row] = await db
      .select()
      .from(table)
      .where(sql`${table.id} = 2`)
      .limit(1);
    if (!row) return null;
    return {
      snapshot: row.snapshot,
      lastAttemptAt: iso(row.lastAttemptAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      error: row.error,
    };
  },

  async succeed(snapshot) {
    const { db, sql } = await database();
    await db.execute(sql`
      INSERT INTO nhl_source_cache (
        id, snapshot, raw_payloads, last_attempt_at, last_success_at,
        next_refresh_at, error, refreshing
      )
      VALUES (2, ${JSON.stringify(snapshot)}::jsonb, '{}'::jsonb,
        statement_timestamp(), statement_timestamp(), NULL, NULL, false)
      ON CONFLICT (id) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        last_attempt_at = statement_timestamp(),
        last_success_at = statement_timestamp(),
        error = NULL,
        refreshing = false,
        lease_token = NULL,
        lease_expires_at = NULL
    `);
  },

  async progress(snapshot, safeError) {
    const { db, sql } = await database();
    await db.execute(sql`
      INSERT INTO nhl_source_cache (
        id, snapshot, raw_payloads, last_attempt_at, last_success_at,
        next_refresh_at, error, refreshing
      )
      VALUES (2, ${JSON.stringify(snapshot)}::jsonb, '{}'::jsonb,
        statement_timestamp(), NULL, NULL, ${safeError}, false)
      ON CONFLICT (id) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        last_attempt_at = statement_timestamp(),
        error = EXCLUDED.error,
        refreshing = false
    `);
  },

  async fail(safeError) {
    const { db, sql } = await database();
    await db.execute(sql`
      INSERT INTO nhl_source_cache (
        id, snapshot, raw_payloads, last_attempt_at, last_success_at,
        next_refresh_at, error, refreshing
      )
      VALUES (2, NULL, '{}'::jsonb, statement_timestamp(), NULL, NULL, ${safeError}, false)
      ON CONFLICT (id) DO UPDATE SET
        last_attempt_at = statement_timestamp(),
        error = EXCLUDED.error,
        refreshing = false
    `);
  },
};