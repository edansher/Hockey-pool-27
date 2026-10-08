import { randomUUID } from "node:crypto";
import {
  getTorontoDates,
  NHL_PROVIDER,
  NHL_REFRESH_INTERVAL_SECONDS,
  NHL_SEASON,
  NHL_SOURCE_URL,
  parseNhlScoreFeed,
  validateNhlGamePayload,
  type NhlDayFeed,
  type NhlSourceFeeds,
  type NhlSourceGame,
} from "./nhl-source-parser";
import {
  postgresNhlSourceStore,
  type NhlRawPayloads,
  type NhlSourceCacheRecord,
  type NhlSourceStore,
} from "./nhl-source-store";
import { poolScoringService } from "./pool-scoring-service";

const REFRESH_INTERVAL_MS = NHL_REFRESH_INTERVAL_SECONDS * 1_000;
const CYCLE_DEADLINE_MS = 90_000;
const REQUEST_DEADLINE_MS = 13_000;
const LEASE_DURATION_MS = CYCLE_DEADLINE_MS + 15_000;
const DB_RETRY_DELAY_MS = 15_000;
const MIN_SCHEDULER_DELAY_MS = 1_000;
const RAW_GAME_STATES = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);
const SCORE_URL = "https://api-web.nhle.com/v1/score";
const GAMECENTER_URL = "https://api-web.nhle.com/v1/gamecenter";
const UPSTREAM_ERROR = "Official NHL data could not be refreshed; cached data was retained.";
const CACHE_ERROR = "NHL source cache is temporarily unavailable; retry shortly.";

export interface NhlSourceScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  unref?(handle: unknown): void;
}

const defaultScheduler: NhlSourceScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  unref: (handle) =>
    (handle as ReturnType<typeof setTimeout>).unref?.(),
};

export interface NhlSourceSnapshot {
  provider: "NHL.com";
  sourceUrl: "https://www.nhl.com/scores";
  season: 20262027;
  refreshIntervalSeconds: 300;
  status: "starting" | "available" | "stale" | "unavailable";
  isRefreshing: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  error: string | null;
  today: NhlDayFeed | null;
  lastNight: NhlDayFeed | null;
}

export type NhlFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface NhlSourceServiceOptions {
  store?: NhlSourceStore;
  fetch?: NhlFetch;
  now?: () => Date;
  timersEnabled?: boolean;
  scheduler?: NhlSourceScheduler;
  poolScoringIngest?: (
    feeds: NhlSourceFeeds,
    rawPayloads: NhlRawPayloads,
    signal: AbortSignal,
  ) => Promise<void>;
}

function isRefreshDue(record: NhlSourceCacheRecord | null, now: Date): boolean {
  if (!record?.nextRefreshAt) return true;
  const nextRefresh = Date.parse(record.nextRefreshAt);
  return !Number.isFinite(nextRefresh) || nextRefresh <= now.getTime();
}

function asIso(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function isEffectivelyRefreshing(record: NhlSourceCacheRecord, now: Date): boolean {
  if (!record.refreshing) return false;
  if (!record.leaseExpiresAt) return true;
  const expiry = Date.parse(record.leaseExpiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

function publicSnapshot(
  record: NhlSourceCacheRecord | null,
  now: Date,
  localRefreshing: boolean,
  readError: boolean,
  transientError: string | null,
): NhlSourceSnapshot {
  const dates = getTorontoDates(now);
  const feeds = record?.snapshot ?? null;
  const lastSuccess = asIso(record?.lastSuccessAt ?? null);
  const successTime = lastSuccess ? Date.parse(lastSuccess) : Number.NaN;
  const currentFeeds =
    feeds !== null &&
    feeds.today?.date === dates.today &&
    feeds.lastNight?.date === dates.lastNight;
  const recentSuccess =
    Number.isFinite(successTime) &&
    now.getTime() - successTime <= REFRESH_INTERVAL_MS * 2 &&
    now.getTime() >= successTime;
  const currentAndRecent = Boolean(currentFeeds && recentSuccess);
  const error = readError ? CACHE_ERROR : transientError ?? record?.error ?? null;

  let status: NhlSourceSnapshot["status"];
  if (!feeds) status = error ? "unavailable" : "starting";
  else if (!error && currentAndRecent) status = "available";
  else status = "stale";

  return {
    provider: NHL_PROVIDER,
    sourceUrl: NHL_SOURCE_URL,
    season: NHL_SEASON,
    refreshIntervalSeconds: NHL_REFRESH_INTERVAL_SECONDS,
    status,
    isRefreshing:
      localRefreshing ||
      (record ? isEffectivelyRefreshing(record, now) : false),
    lastAttemptAt: asIso(record?.lastAttemptAt ?? null),
    lastSuccessAt: lastSuccess,
    nextRefreshAt: asIso(record?.nextRefreshAt ?? null),
    error,
    today: feeds?.today ?? null,
    lastNight: feeds?.lastNight ?? null,
  };
}

async function fetchJson(
  fetchImpl: NhlFetch,
  url: string,
  cycleSignal: AbortSignal,
): Promise<unknown> {
  if (cycleSignal.aborted) throw new Error("NHL refresh cancelled");
  const requestController = new AbortController();
  const timeout = setTimeout(() => requestController.abort(), REQUEST_DEADLINE_MS);
  const abortRequest = () => requestController.abort();
  cycleSignal.addEventListener("abort", abortRequest, { once: true });
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error("NHL upstream request failed");
    return await response.json();
  } catch {
    if (cycleSignal.aborted) throw new Error("NHL refresh cancelled");
    throw new Error("NHL upstream request failed");
  } finally {
    clearTimeout(timeout);
    cycleSignal.removeEventListener("abort", abortRequest);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  maximumConcurrency: number,
  signal: AbortSignal,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      if (signal.aborted) throw new Error("NHL refresh cancelled");
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(maximumConcurrency, values.length) }, () => worker()),
  );
  return results;
}

function eligibleForRawStats(game: NhlSourceGame): boolean {
  return (
    game.poolEligible &&
    game.season === NHL_SEASON &&
    game.gameType === 2 &&
    RAW_GAME_STATES.has(game.gameState)
  );
}

export class NhlSourceService {
  private readonly store: NhlSourceStore;
  private readonly fetchImpl: NhlFetch;
  private readonly now: () => Date;
  private readonly timersEnabled: boolean;
  private readonly scheduler: NhlSourceScheduler;
  private readonly poolScoringIngest: NhlSourceServiceOptions["poolScoringIngest"];
  private stopped = true;
  private inFlight: Promise<void> | null = null;
  private refreshCheck: Promise<void> | null = null;
  private refreshPending = false;
  private transientError: string | null = null;
  private cycleController: AbortController | null = null;
  private refreshTimer: unknown | null = null;

  constructor(options: NhlSourceServiceOptions = {}) {
    this.store = options.store ?? postgresNhlSourceStore;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timersEnabled = options.timersEnabled ?? true;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.poolScoringIngest = options.poolScoringIngest ?? (
      this.store === postgresNhlSourceStore
        ? (feeds, rawPayloads, signal) =>
            poolScoringService.ingest(feeds, rawPayloads, signal)
        : undefined
    );
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.refreshTimer !== null) this.scheduler.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.cycleController?.abort();
    await (this.refreshCheck ?? this.inFlight);
  }

  async getSnapshot(): Promise<NhlSourceSnapshot> {
    let record: NhlSourceCacheRecord | null = null;
    let readError = false;
    try {
      record = await this.store.read();
    } catch {
      readError = true;
    }

    const now = this.now();
    if (!readError && !this.stopped && isRefreshDue(record, now)) {
      void this.refreshIfDue();
    }
    return publicSnapshot(
      record,
      now,
      this.inFlight !== null || this.refreshPending,
      readError,
      this.transientError,
    );
  }

  /**
   * Runs only when the persisted due time allows it. The PostgreSQL claim is
   * still the authority across server replicas; this local check is a courtesy.
   */
  refreshIfDue(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (this.refreshCheck) return this.refreshCheck;

    if (this.refreshTimer !== null) this.scheduler.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.refreshPending = true;
    const check = this.checkDueAndRefresh();
    this.refreshCheck = check;
    void check.finally(() => {
      if (this.refreshCheck === check) this.refreshCheck = null;
      this.refreshPending = false;
      if (!this.stopped) void this.scheduleNext(false);
    });
    return check;
  }

  private async checkDueAndRefresh(): Promise<void> {
    let record: NhlSourceCacheRecord | null;
    try {
      record = await this.store.read();
    } catch {
      return;
    }
    if (this.stopped || !isRefreshDue(record, this.now())) return;
    if (record && isEffectivelyRefreshing(record, this.now())) return;
    if (this.inFlight) return this.inFlight;

    const operation = this.executeCycle();
    this.inFlight = operation;
    void operation.finally(() => {
      if (this.inFlight === operation) this.inFlight = null;
    });
    await operation;
  }

  private armTimer(delayMs: number, callback: () => void): void {
    if (this.refreshTimer !== null) this.scheduler.clearTimeout(this.refreshTimer);
    const boundedDelay = Math.min(
      REFRESH_INTERVAL_MS,
      Math.max(MIN_SCHEDULER_DELAY_MS, delayMs),
    );
    this.refreshTimer = this.scheduler.setTimeout(callback, boundedDelay);
    this.scheduler.unref?.(this.refreshTimer);
  }

  private async scheduleNext(immediateIfDue = true): Promise<void> {
    if (this.stopped || !this.timersEnabled) return;
    if (this.refreshTimer !== null) this.scheduler.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;

    let record: NhlSourceCacheRecord | null;
    try {
      record = await this.store.read();
    } catch {
      this.armTimer(DB_RETRY_DELAY_MS, () => {
        this.refreshTimer = null;
        void this.scheduleNext();
      });
      return;
    }

    if (this.stopped) return;
    const now = this.now();
    if (record && isEffectivelyRefreshing(record, now)) {
      const leaseExpiry = record.leaseExpiresAt
        ? Date.parse(record.leaseExpiresAt)
        : Number.NaN;
      const delay = Number.isFinite(leaseExpiry)
        ? leaseExpiry - now.getTime()
        : REFRESH_INTERVAL_MS;
      this.armTimer(delay, () => {
        this.refreshTimer = null;
        void this.refreshIfDue();
      });
      return;
    }

    if (isRefreshDue(record, now)) {
      if (immediateIfDue) {
        void this.refreshIfDue();
        return;
      }
      this.armTimer(MIN_SCHEDULER_DELAY_MS, () => {
        this.refreshTimer = null;
        void this.refreshIfDue();
      });
      return;
    }
    const nextRefreshAt = Date.parse(record!.nextRefreshAt!);
    const waitMs = Number.isFinite(nextRefreshAt)
      ? nextRefreshAt - now.getTime()
      : DB_RETRY_DELAY_MS;
    this.armTimer(waitMs, () => {
      this.refreshTimer = null;
      void this.refreshIfDue();
    });
  }

  private async executeCycle(): Promise<void> {
    const token = randomUUID();
    const controller = new AbortController();
    this.cycleController = controller;
    let claimed = false;

    try {
      claimed = await this.store.claim(token, REFRESH_INTERVAL_MS, LEASE_DURATION_MS);
      if (!claimed) return;
      if (this.stopped) throw new Error("NHL refresh cancelled");
      if (controller.signal.aborted) throw new Error("NHL refresh cancelled");

      const deadline = setTimeout(() => controller.abort(), CYCLE_DEADLINE_MS);
      try {
        const dates = getTorontoDates(this.now());
        const feedBodies = await mapWithConcurrency(
          [dates.today, dates.lastNight],
          4,
          controller.signal,
          (date) => fetchJson(this.fetchImpl, `${SCORE_URL}/${date}`, controller.signal),
        );
        const feeds: NhlSourceFeeds = {
          today: parseNhlScoreFeed(feedBodies[0], dates.today),
          lastNight: parseNhlScoreFeed(feedBodies[1], dates.lastNight),
        };

        const games = [...feeds.today.games, ...feeds.lastNight.games].filter(
          eligibleForRawStats,
        );
        const rawPayloads: NhlRawPayloads = {};
        const payloadTasks = games.flatMap((game) => [
          { game, kind: "boxscore" as const },
          { game, kind: "play-by-play" as const },
        ]);
        const payloadBodies = await mapWithConcurrency(
          payloadTasks,
          4,
          controller.signal,
          ({ game, kind }) =>
            fetchJson(
              this.fetchImpl,
              `${GAMECENTER_URL}/${game.id}/${kind}`,
              controller.signal,
            ),
        );
        for (let index = 0; index < payloadTasks.length; index += 2) {
          const game = payloadTasks[index]!.game;
          rawPayloads[String(game.id)] = {
            boxscore: validateNhlGamePayload(payloadBodies[index], game),
            playByPlay: validateNhlGamePayload(payloadBodies[index + 1], game),
          };
        }

        if (controller.signal.aborted) throw new Error("NHL refresh cancelled");
        await this.store.succeed(token, feeds, rawPayloads);
        await this.poolScoringIngest?.(feeds, rawPayloads, controller.signal);
        this.transientError = null;
      } finally {
        clearTimeout(deadline);
      }
    } catch {
      controller.abort();
      if (claimed) {
        try {
          await this.store.fail(token, UPSTREAM_ERROR);
          this.transientError = null;
        } catch {
          this.transientError = CACHE_ERROR;
        }
      } else if (!this.stopped) {
        this.transientError = CACHE_ERROR;
      }
    } finally {
      if (this.cycleController === controller) this.cycleController = null;
    }
  }
}

export const nhlSourceService = new NhlSourceService();