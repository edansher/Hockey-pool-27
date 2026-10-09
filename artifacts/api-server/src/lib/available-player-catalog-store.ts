export const NHL_CATALOG_TEAMS = [
  "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ",
  "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NSH",
  "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SJS", "SEA",
  "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WSH", "WPG",
] as const;
export const NHL_CATALOG_REFRESH_MS = 60 * 60 * 1_000;
export const NHL_CATALOG_LEASE_MS = 5 * 60 * 1_000;

export interface CatalogPlayer {
  nhlPlayerId: number;
  name: string;
  team: string;
  position: "F" | "C" | "D" | "G";
}
export interface CatalogRecord {
  catalogType: "available-player-catalog";
  version: 1;
  teams: Record<string, CatalogPlayer[]>;
  teamRefreshedAt?: Record<string, string>;
  archivePlayers?: CatalogPlayer[];
  lastCatalogRefreshAt: string | null;
  nextRefreshAt: string | null;
  reason: string | null;
}

const empty: CatalogRecord = {
  catalogType: "available-player-catalog",
  version: 1, teams: {}, lastCatalogRefreshAt: null, nextRefreshAt: null, reason: null,
};

export interface AvailableCatalogStore {
  read(): Promise<CatalogRecord | null>;
  claim(token: string): Promise<boolean>;
  succeed(token: string, record: CatalogRecord): Promise<void>;
  fail(token: string, reason: string): Promise<void>;
}

export const postgresAvailableCatalogStore: AvailableCatalogStore = {
  async read() {
    const cache = await import("@workspace/db");
    const { db } = cache;
    const { sql } = await import("drizzle-orm");
    const [row] = await db.select().from(cache.nhlSourceCacheTable)
      .where(sql`${cache.nhlSourceCacheTable.id} = 4`).limit(1);
    if (!row?.snapshot || typeof row.snapshot !== "object") return null;
    const value = row.snapshot as Partial<CatalogRecord>;
    if (value.catalogType !== "available-player-catalog" || value.version !== 1 ||
        !value.teams || typeof value.teams !== "object") return null;
    return {
      catalogType: "available-player-catalog",
      version: 1,
      teams: value.teams as Record<string, CatalogPlayer[]>,
      teamRefreshedAt: value.teamRefreshedAt && typeof value.teamRefreshedAt === "object"
        ? value.teamRefreshedAt as Record<string, string>
        : {},
      archivePlayers: Array.isArray(value.archivePlayers)
        ? value.archivePlayers as CatalogPlayer[]
        : [],
      lastCatalogRefreshAt: value.lastCatalogRefreshAt ?? null,
      nextRefreshAt: row.nextRefreshAt?.toISOString() ?? null,
      reason: row.error ?? value.reason ?? null,
    };
  },
  async claim(token) {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`
      INSERT INTO nhl_source_cache
        (id, snapshot, raw_payloads, last_attempt_at, next_refresh_at, error, refreshing, lease_token, lease_expires_at)
      VALUES (4, ${JSON.stringify(empty)}::jsonb, '{}'::jsonb, statement_timestamp(),
        statement_timestamp() + (${NHL_CATALOG_REFRESH_MS} * interval '1 millisecond'),
        NULL, true, ${token}, statement_timestamp() + (${NHL_CATALOG_LEASE_MS} * interval '1 millisecond'))
      ON CONFLICT (id) DO UPDATE SET
        last_attempt_at = statement_timestamp(),
        next_refresh_at = statement_timestamp() + (${NHL_CATALOG_REFRESH_MS} * interval '1 millisecond'),
        refreshing = true, lease_token = ${token},
        lease_expires_at = statement_timestamp() + (${NHL_CATALOG_LEASE_MS} * interval '1 millisecond')
      WHERE (nhl_source_cache.lease_expires_at IS NULL OR nhl_source_cache.lease_expires_at <= clock_timestamp())
        AND (nhl_source_cache.next_refresh_at IS NULL OR nhl_source_cache.next_refresh_at <= clock_timestamp())
        AND (nhl_source_cache.snapshot IS NULL OR
          nhl_source_cache.snapshot->>'catalogType' = 'available-player-catalog')
      RETURNING id
    `);
    return result.rows.length > 0;
  },
  async succeed(token, record) {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      INSERT INTO nhl_source_cache
        (id, snapshot, raw_payloads, last_attempt_at, last_success_at, next_refresh_at, error, refreshing)
      VALUES (4, ${JSON.stringify(record)}::jsonb, '{}'::jsonb, statement_timestamp(),
        statement_timestamp(), statement_timestamp() + (${NHL_CATALOG_REFRESH_MS} * interval '1 millisecond'),
        NULL, false)
      ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot,
        last_attempt_at = statement_timestamp(), last_success_at = statement_timestamp(),
        next_refresh_at = EXCLUDED.next_refresh_at, error = NULL, refreshing = false,
        lease_token = NULL, lease_expires_at = NULL
      WHERE nhl_source_cache.lease_token = ${token}
    `);
  },
  async fail(token, reason) {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      UPDATE nhl_source_cache SET error = ${reason}, refreshing = false,
        lease_token = NULL, lease_expires_at = NULL
      WHERE id = 4 AND lease_token = ${token}
    `);
  },
};