import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import {
  CBS_INJURIES_URL,
  NHL_INJURY_REFRESH_HOUR,
  NHL_INJURY_TIMEZONE,
  cbsFeedCoversTeam,
  mapCbsInjuriesToPool,
  parseCbsInjuryPage,
  type InjuryIdentity,
} from "./pool-injury-parser";

const USER_AGENT = "Mozilla/5.0 (compatible; HockeyPoolInjuryRefresh/4.0)";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const LEASE_MS = 180_000;
const RETRY_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
// Reprocess retained facts after evidence-parser changes, without discarding them.
const INJURY_PARSER_VERSION = "4";

export interface PoolPlayerInjury {
  nhlPlayerId: number;
  name: string;
  team: string | null;
  status: "injured" | "not_reported_injured" | "unknown";
  details: string | null;
  sourceUrl: string | null;
  reportedAt: string | null;
  checkedAt: string | null;
}

export interface PoolInjurySnapshot {
  status: "available" | "partial" | "stale" | "unavailable" | "refreshing";
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  timezone: "America/Toronto";
  refreshHour: 8;
  error: string | null;
  sourceUrl: string;
  totalPlayers: number;
  confirmedInjured: number;
  unknownPlayers: number;
  sourceReports: number;
  players: PoolPlayerInjury[];
}

interface InjuryStoreRecord {
  snapshot: PoolInjurySnapshot | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  error: string | null;
  refreshing: boolean;
  leaseExpiresAt: string | null;
}

export interface PoolInjuryStore {
  read(): Promise<InjuryStoreRecord | null>;
  claim(token: string, nextRefreshAt: string, leaseMs: number): Promise<boolean>;
  succeed(token: string, snapshot: PoolInjurySnapshot): Promise<void>;
  fail(token: string, error: string, retryAt: string): Promise<void>;
}

export type InjuryFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface InjuryScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  unref?(handle: unknown): void;
}

const defaultScheduler: InjuryScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  unref: handle => (handle as ReturnType<typeof setTimeout>).unref?.(),
};

async function injuryDatabase() {
  const [drizzle, workspaceDb] = await Promise.all([
    import("drizzle-orm"),
    import("@workspace/db"),
  ]);
  return { sql: drizzle.sql, db: workspaceDb.db, table: workspaceDb.nhlSourceCacheTable };
}

export const postgresPoolInjuryStore: PoolInjuryStore = {
  async read() {
    const { db, sql, table } = await injuryDatabase();
    const [row] = await db.select().from(table).where(sql`${table.id} = 3`).limit(1);
    if (!row) return null;
    return {
      snapshot: row.snapshot as PoolInjurySnapshot | null,
      lastCheckedAt: row.lastAttemptAt?.toISOString() ?? null,
      lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      nextRefreshAt: row.rawPayloads["injuryParserVersion"] === INJURY_PARSER_VERSION
        ? row.nextRefreshAt?.toISOString() ?? null : null,
      error: row.error,
      refreshing: row.refreshing,
      leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    };
  },
  async claim(token, nextRefreshAt, leaseMs) {
    const { db, sql } = await injuryDatabase();
    const result = await db.execute(sql`
      INSERT INTO nhl_source_cache
        (id, snapshot, raw_payloads, last_attempt_at, last_success_at, next_refresh_at, error, refreshing, lease_token, lease_expires_at)
      VALUES (3, NULL, jsonb_build_object('injuryParserVersion', ${INJURY_PARSER_VERSION}::text), statement_timestamp(), NULL, ${nextRefreshAt}::timestamptz, NULL, true, ${token},
        statement_timestamp() + (${leaseMs} * interval '1 millisecond'))
      ON CONFLICT (id) DO UPDATE SET
        last_attempt_at = statement_timestamp(), next_refresh_at = EXCLUDED.next_refresh_at,
        raw_payloads = EXCLUDED.raw_payloads,
        error = NULL, refreshing = true, lease_token = EXCLUDED.lease_token,
        lease_expires_at = statement_timestamp() + (${leaseMs} * interval '1 millisecond')
      WHERE (nhl_source_cache.lease_expires_at IS NULL OR nhl_source_cache.lease_expires_at <= clock_timestamp())
        AND (nhl_source_cache.next_refresh_at IS NULL OR nhl_source_cache.next_refresh_at <= clock_timestamp()
          OR nhl_source_cache.raw_payloads->>'injuryParserVersion' IS DISTINCT FROM ${INJURY_PARSER_VERSION}::text)
      RETURNING id
    `);
    return result.rows.length > 0;
  },
  async succeed(token, snapshot) {
    const { db, sql, table } = await injuryDatabase();
    await db.update(table).set({
      snapshot,
      lastSuccessAt: snapshot.lastSuccessAt ? new Date(snapshot.lastSuccessAt) : new Date(),
      error: null,
      refreshing: false,
      leaseToken: null,
      leaseExpiresAt: null,
      nextRefreshAt: snapshot.nextRefreshAt ? new Date(snapshot.nextRefreshAt) : null,
    }).where(sql`${table.id} = 3 AND ${table.leaseToken} = ${token}`);
  },
  async fail(token, error, retryAt) {
    const { db, sql, table } = await injuryDatabase();
    await db.update(table).set({
      error, refreshing: false, leaseToken: null, leaseExpiresAt: null,
      nextRefreshAt: new Date(retryAt),
    }).where(sql`${table.id} = 3 AND ${table.leaseToken} = ${token}`);
  },
};

export interface PoolInjuryServiceOptions {
  store?: PoolInjuryStore;
  fetch?: InjuryFetch;
  now?: () => Date;
  scheduler?: InjuryScheduler;
  timersEnabled?: boolean;
  loadRosters?: typeof import("./draft-roster-store").loadDraftRosters;
}

function torontoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NHL_INJURY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function nextTorontoEight(now: Date): Date {
  const [year, month, day] = torontoDate(now).split("-").map(Number) as [number, number, number];
  const targetLocal = new Date(Date.UTC(year, month - 1, day, NHL_INJURY_REFRESH_HOUR));
  const offsetAt = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: NHL_INJURY_TIMEZONE, timeZoneName: "longOffset",
    }).formatToParts(instant);
    const value = parts.find(part => part.type === "timeZoneName")?.value ?? "GMT";
    const match = value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return 0;
    return (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
  };
  let utc = targetLocal.getTime() - offsetAt(now);
  utc = targetLocal.getTime() - offsetAt(new Date(utc));
  if (utc <= now.getTime()) {
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, NHL_INJURY_REFRESH_HOUR));
    utc = tomorrow.getTime() - offsetAt(new Date(utc + DAY_MS));
    utc = tomorrow.getTime() - offsetAt(new Date(utc));
  }
  return new Date(utc);
}

function rosterIdentities(rosters: Awaited<ReturnType<typeof import("./draft-roster-store").loadDraftRosters>>): InjuryIdentity[] {
  const identities = new Map<number, InjuryIdentity>();
  for (const roster of rosters) {
    for (const selection of roster.selections) {
      const data = selection as typeof selection & Record<string, unknown>;
      const goalies = Array.isArray(data.goalies) ? data.goalies as unknown as Record<string, unknown>[] : [];
      const add = (idValue: unknown, nameValue: unknown, teamValue: unknown) => {
        const id = typeof idValue === "number" && Number.isInteger(idValue) && idValue > 0 ? idValue : null;
        if (id === null) return;
        const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : null;
        const team = typeof teamValue === "string" && teamValue.trim() ? teamValue.trim() : null;
        const prior = identities.get(id);
        if (!prior || (!prior.name && name)) identities.set(id, { nhlPlayerId: id, name: name ?? prior?.name ?? `NHL player ${id}`, team: team ?? prior?.team ?? null });
      };
      if (selection.assetType === "skater") {
        add(selection.nhlPlayerId, selection.confirmedName, selection.confirmedTeam);
      }
      for (const goalie of goalies) add(goalie.nhlPlayerId, goalie.confirmedName, goalie.confirmedTeam);
    }
  }
  return [...identities.values()].sort((a, b) => a.nhlPlayerId - b.nhlPlayerId);
}

async function fetchCbsSource(
  fetchImpl: InjuryFetch,
  url: string,
  parentSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CBS Sports source returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("CBS Sports injury page exceeded the size limit");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("CBS Sports injury page exceeded the size limit");
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8");
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function emptySnapshot(now: Date, status: PoolInjurySnapshot["status"]): PoolInjurySnapshot {
  return {
    status, lastCheckedAt: null, lastSuccessAt: null, nextRefreshAt: nextTorontoEight(now).toISOString(),
    timezone: NHL_INJURY_TIMEZONE, refreshHour: NHL_INJURY_REFRESH_HOUR,
    error: null, sourceUrl: CBS_INJURIES_URL, totalPlayers: 0, confirmedInjured: 0,
    unknownPlayers: 0, sourceReports: 0, players: [],
  };
}

export class PoolInjuryService {
  private readonly store: PoolInjuryStore;
  private readonly fetchImpl: InjuryFetch;
  private readonly now: () => Date;
  private readonly scheduler: InjuryScheduler;
  private readonly timersEnabled: boolean;
  private readonly loadRosters: typeof import("./draft-roster-store").loadDraftRosters;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;
  private transientError: string | null = null;
  private cycleController: AbortController | null = null;

  constructor(options: PoolInjuryServiceOptions = {}) {
    this.store = options.store ?? postgresPoolInjuryStore;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.timersEnabled = options.timersEnabled ?? true;
    this.loadRosters = options.loadRosters ??
      (() => import("./draft-roster-store").then(({ loadDraftRosters }) => loadDraftRosters()));
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      const record = await this.store.read();
      if (!record || this.isDue(record.nextRefreshAt)) void this.refreshIfDue();
      else this.arm(record.nextRefreshAt);
    } catch {
      this.transientError = "NHL injury cache is temporarily unavailable; retry shortly.";
      this.armRetry();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
    this.cycleController?.abort();
    await this.inFlight;
  }

  async getSnapshot(): Promise<PoolInjurySnapshot> {
    let record: InjuryStoreRecord | null;
    try {
      record = await this.store.read();
      this.transientError = null;
    } catch {
      const unavailable = emptySnapshot(this.now(), "unavailable");
      unavailable.error = "NHL injury cache is temporarily unavailable; retry shortly.";
      return unavailable;
    }
    const due = this.isDue(record?.nextRefreshAt);
    if ((!record || due) && !this.stopped) void this.refreshIfDue();
    const result = record?.snapshot ? { ...record.snapshot } : emptySnapshot(this.now(), "unavailable");
    if (record?.nextRefreshAt) result.nextRefreshAt = record.nextRefreshAt;
    if (result.lastSuccessAt && due) {
      result.status = "stale";
      result.error = "Morning injury check is due; showing last-checked reports while updating.";
    }
    const refreshing = Boolean(this.inFlight || (record?.refreshing && (!record.leaseExpiresAt || Date.parse(record.leaseExpiresAt) > this.now().getTime())));
    if (record?.lastCheckedAt) result.lastCheckedAt = record.lastCheckedAt;
    if (refreshing && !result.lastSuccessAt && !record?.error && !this.transientError) result.status = "refreshing";
    if (record?.error || this.transientError) {
      result.error = this.transientError ?? record?.error ?? null;
      if (result.lastSuccessAt) result.status = "stale";
    }
    return result;
  }

  private isDue(next: string | null | undefined): boolean {
    return !next || !Number.isFinite(Date.parse(next)) || Date.parse(next) <= this.now().getTime();
  }

  private arm(at: string | null | undefined): void {
    if (!this.timersEnabled || this.stopped) return;
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    const target = at ? Date.parse(at) : Number.NaN;
    const delay = Number.isFinite(target) && target > this.now().getTime()
      ? target - this.now().getTime()
      : RETRY_MS;
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      void this.refreshIfDue();
    }, Math.max(1_000, delay));
    this.scheduler.unref?.(this.timer);
  }

  private armRetry(): void {
    this.arm(new Date(this.now().getTime() + RETRY_MS).toISOString());
  }

  private refreshIfDue(): Promise<void> {
    if (this.stopped || this.inFlight) return this.inFlight ?? Promise.resolve();
    const task = this.refreshCycle();
    this.inFlight = task;
    void task.finally(() => {
      if (this.inFlight === task) this.inFlight = null;
      if (!this.stopped && this.timer === null) {
        void this.store.read().then(record => this.arm(record?.nextRefreshAt)).catch(() => this.armRetry());
      }
    });
    return task;
  }

  private async refreshCycle(): Promise<void> {
    const controller = new AbortController();
    this.cycleController = controller;
    let record: InjuryStoreRecord | null = null;
    try {
      record = await this.store.read();
      this.transientError = null;
      if (record?.snapshot && !this.isDue(record.nextRefreshAt)) {
        this.arm(record?.nextRefreshAt);
        this.cycleController = null;
        return;
      }
    } catch {
      this.transientError = "NHL injury cache is temporarily unavailable; retry shortly.";
      this.armRetry();
      this.cycleController = null;
      return;
    }

    const token = randomUUID();
    const retryAt = new Date(this.now().getTime() + RETRY_MS).toISOString();
    let claimed = false;
    try {
      claimed = await this.store.claim(token, retryAt, LEASE_MS);
      if (!claimed) {
        this.armRetry();
        return;
      }
      const now = this.now();
      const rosters = await this.loadRosters();
      const identities = rosterIdentities(rosters);
      const html = await fetchCbsSource(this.fetchImpl, CBS_INJURIES_URL, controller.signal);
      const feed = parseCbsInjuryPage(html);
      if (!feed) throw new Error("CBS Sports injury page did not contain a complete, validated current league feed");
      const feedRowsByPlayer = mapCbsInjuriesToPool(feed, identities);
      if (controller.signal.aborted || this.stopped) throw new Error("NHL injury refresh cancelled");
      const checkedAt = now.toISOString();
      const players = identities.map(identity => {
        const row = feedRowsByPlayer.get(identity.nhlPlayerId);
        if (!row && !cbsFeedCoversTeam(feed, identity.team)) {
          const previous = record?.snapshot?.players.find(player =>
            player.nhlPlayerId === identity.nhlPlayerId,
          );
          if (previous?.status === "injured") {
            return { ...previous, checkedAt };
          }
          return {
            nhlPlayerId: identity.nhlPlayerId,
            name: identity.name,
            team: identity.team,
            status: "unknown" as const,
            details: "CBS did not publish a validated injury table for this club; absence is not evidence of recovery.",
            sourceUrl: CBS_INJURIES_URL,
            reportedAt: null,
            checkedAt,
          };
        }
        const status = row?.status ?? "not_reported_injured";
        return {
          nhlPlayerId: identity.nhlPlayerId, name: identity.name, team: identity.team,
          status, details: row?.details ?? null,
          sourceUrl: row ? CBS_INJURIES_URL : null,
          reportedAt: row ? row.reportedAt ?? checkedAt : null, checkedAt,
        };
      });
      const unknownPlayers = players.filter(player => player.status === "unknown").length;
      const partial = !feed.complete || unknownPlayers > 0;
      const snapshot: PoolInjurySnapshot = {
        status: partial ? "partial" : "available",
        lastCheckedAt: checkedAt, lastSuccessAt: checkedAt,
        nextRefreshAt: nextTorontoEight(now).toISOString(),
        timezone: NHL_INJURY_TIMEZONE, refreshHour: NHL_INJURY_REFRESH_HOUR,
        error: feed.complete ? null :
          `CBS Sports returned injury tables for ${feed.coveredTeams} of 32 clubs; omitted clubs remain unknown.`,
        sourceUrl: CBS_INJURIES_URL,
        totalPlayers: players.length,
        confirmedInjured: players.filter(player => player.status === "injured").length,
        unknownPlayers,
        sourceReports: feed.sourceReports,
        players,
      };
      await this.store.succeed(token, snapshot);
      this.transientError = null;
      this.arm(snapshot.nextRefreshAt);
    } catch (error) {
      const safeError = "Official CBS Sports injury data could not be refreshed; cached injury data was retained.";
      this.transientError = null;
      if (claimed) {
        try {
          await this.store.fail(token, safeError, retryAt);
        } catch {
          this.transientError = "NHL injury cache is temporarily unavailable; retry shortly.";
        }
      } else {
        this.transientError = "NHL injury cache is temporarily unavailable; retry shortly.";
      }
      logger.warn({ err: error }, "CBS Sports injury refresh failed");
      this.armRetry();
    } finally {
      if (this.cycleController === controller) this.cycleController = null;
    }
  }
}

export const poolInjuryService = new PoolInjuryService();