import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const nhlSourceCacheTable = pgTable("nhl_source_cache", {
  id: integer("id").primaryKey().default(1),
  snapshot: jsonb("snapshot").$type<unknown>(),
  rawPayloads: jsonb("raw_payloads").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  nextRefreshAt: timestamp("next_refresh_at", { withTimezone: true }),
  error: text("error"),
  refreshing: boolean("refreshing").notNull().default(false),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
});

export type NhlSourceCache = typeof nhlSourceCacheTable.$inferSelect;