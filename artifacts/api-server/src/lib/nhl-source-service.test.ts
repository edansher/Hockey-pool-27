import assert from "node:assert/strict";
import test from "node:test";
import { getTorontoDates, type NhlSourceFeeds } from "./nhl-source-parser";
import {
  NhlSourceService,
  type NhlFetch,
  type NhlSourceScheduler,
} from "./nhl-source-service";
import type {
  NhlRawPayloads,
  NhlSourceCacheRecord,
  NhlSourceStore,
} from "./nhl-source-store";

const fixedNow = new Date("2026-10-01T16:00:00.000Z");

function feedsForNow(now = fixedNow): NhlSourceFeeds {
  const dates = getTorontoDates(now);
  return {
    today: { date: dates.today, games: [] },
    lastNight: { date: dates.lastNight, games: [] },
  };
}

function fakeStore(now: () => Date, initial: NhlSourceCacheRecord | null = null) {
  let current = initial ? structuredClone(initial) : null;
  let currentToken: string | null = null;
  let readFailure = false;
  let claimFailure = false;

  const store: NhlSourceStore = {
    async read() {
      if (readFailure) throw new Error("private database connection details");
      return current ? structuredClone(current) : null;
    },
    async claim(token, cooldownMs, leaseMs) {
      if (claimFailure) throw new Error("private database acquisition details");
      const currentTime = now().getTime();
      const leaseExpired =
        !current?.leaseExpiresAt || Date.parse(current.leaseExpiresAt) <= currentTime;
      const cooldownElapsed =
        !current?.nextRefreshAt || Date.parse(current.nextRefreshAt) <= currentTime;
      if (!leaseExpired || !cooldownElapsed) return false;

      current ??= {
        snapshot: null,
        rawPayloads: {},
        lastAttemptAt: null,
        lastSuccessAt: null,
        nextRefreshAt: null,
        error: null,
        refreshing: false,
        leaseExpiresAt: null,
      };
      currentToken = token;
      current.lastAttemptAt = now().toISOString();
      current.nextRefreshAt = new Date(currentTime + cooldownMs).toISOString();
      current.refreshing = true;
      current.leaseExpiresAt = new Date(currentTime + leaseMs).toISOString();
      return true;
    },
    async succeed(token, feeds, rawPayloads) {
      if (!current || token !== currentToken) return;
      current.snapshot = structuredClone(feeds);
      current.rawPayloads = structuredClone(rawPayloads);
      current.lastSuccessAt = now().toISOString();
      current.error = null;
      current.refreshing = false;
      current.leaseExpiresAt = null;
      currentToken = null;
    },
    async fail(token, safeError) {
      if (!current || token !== currentToken) return;
      current.error = safeError;
      current.refreshing = false;
      current.leaseExpiresAt = null;
      currentToken = null;
    },
  };

  return {
    store,
    readCurrent: () => (current ? structuredClone(current) : null),
    setReadFailure: (value: boolean) => {
      readFailure = value;
    },
    setClaimFailure: (value: boolean) => {
      claimFailure = value;
    },
    claim: (token: string, cooldownMs: number, leaseMs: number) =>
      store.claim(token, cooldownMs, leaseMs),
    succeed: (token: string, value: NhlSourceFeeds, raw: NhlRawPayloads = {}) =>
      store.succeed(token, value, raw),
  };
}

class FakeScheduler implements NhlSourceScheduler {
  private readonly pending = new Map<object, { callback: () => void; delayMs: number }>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = {};
    this.pending.set(handle, { callback, delayMs });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as object);
  }

  nextDelay(): number | null {
    return [...this.pending.values()][0]?.delayMs ?? null;
  }

  runNext(): void {
    const next = this.pending.entries().next();
    if (next.done) throw new Error("No fake timer is scheduled");
    const [handle, timer] = next.value;
    this.pending.delete(handle);
    timer.callback();
  }
}

async function flushSchedulerWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function scoreResponse(date: string) {
  return { currentDate: date, games: [] };
}

test("successful refresh persists both Toronto-date feeds and reports the exact public metadata", async () => {
  const now = () => new Date(fixedNow);
  const fake = fakeStore(now);
  const calls: string[] = [];
  const fetch: NhlFetch = async (input) => {
    const url = new URL(input);
    calls.push(url.pathname);
    const date = url.pathname.split("/").at(-1)!;
    return okResponse(scoreResponse(date));
  };
  const service = new NhlSourceService({
    store: fake.store,
    fetch,
    now,
    timersEnabled: false,
  });

  await service.start();
  await service.refreshIfDue();
  const result = await service.getSnapshot();
  const dates = getTorontoDates(fixedNow);
  assert.deepEqual(calls.sort(), [
    `/v1/score/${dates.lastNight}`,
    `/v1/score/${dates.today}`,
  ]);
  assert.equal(result.status, "available");
  assert.equal(result.provider, "NHL.com");
  assert.equal(result.sourceUrl, "https://www.nhl.com/scores");
  assert.equal(result.season, 20262027);
  assert.equal(result.refreshIntervalSeconds, 300);
  assert.equal(result.today?.date, dates.today);
  assert.equal(result.lastNight?.date, dates.lastNight);
  assert.equal(result.isRefreshing, false);
  assert.equal(result.nextRefreshAt, "2026-10-01T16:05:00.000Z");
  assert.deepEqual(fake.readCurrent()?.rawPayloads, {});
  await service.stop();
});

test("refresh stores raw stats only for eligible regular-season live/final games with four-call concurrency", async () => {
  const now = () => new Date(fixedNow);
  const dates = getTorontoDates(fixedNow);
  const fake = fakeStore(now);
  let active = 0;
  let maximumActive = 0;
  const paths: string[] = [];
  const fetch: NhlFetch = async (input) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const url = new URL(input);
    paths.push(url.pathname);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;

    if (url.pathname.includes("/score/")) {
      const date = url.pathname.split("/").at(-1)!;
      const games =
        date === dates.today
          ? [2026020009, 2026020010, 2026020011, 2025020001].map((id, index) => ({
              id,
              season: index === 3 ? 20252026 : 20262027,
              gameType: 2,
              gameDate: date,
              gameState: "FINAL",
              awayTeam: { name: { default: "Flyers" }, abbrev: "PHI", score: 0 },
              homeTeam: { name: { default: "Devils" }, abbrev: "NJD", score: 0 },
            }))
          : [];
      return okResponse({ currentDate: date, games });
    }

    const id = Number(url.pathname.split("/").at(-2));
    const index = id === 2025020001 ? 3 : id - 2026020009;
    return okResponse({
      id,
      season: index === 3 ? 20252026 : 20262027,
      gameType: 2,
      gameDate: dates.today,
      raw: url.pathname.endsWith("/boxscore") ? "boxscore" : "play-by-play",
    });
  };
  const service = new NhlSourceService({
    store: fake.store,
    fetch,
    now,
    timersEnabled: false,
  });

  await service.start();
  await service.refreshIfDue();
  assert.equal(maximumActive, 4);
  assert.equal(paths.filter((path) => path.includes("/boxscore")).length, 3);
  assert.equal(paths.filter((path) => path.includes("/play-by-play")).length, 3);
  assert.equal(paths.some((path) => path.includes("2025020001")), false);
  assert.deepEqual(Object.keys(fake.readCurrent()?.rawPayloads ?? {}).sort(), [
    "2026020009",
    "2026020010",
    "2026020011",
  ]);
  await service.stop();
});

test("upstream failure keeps the entire last successful snapshot and exposes only a safe error", async () => {
  const now = () => new Date(fixedNow);
  const previous = feedsForNow();
  previous.today.games.push({
    id: 2026020009,
    season: 20262027,
    gameType: 2,
    gameDate: previous.today.date,
    gameState: "FUT",
    startTimeUTC: null,
    awayAbbrev: "PHI",
    awayName: "Flyers",
    awayScore: null,
    homeAbbrev: "NJD",
    homeName: "Devils",
    homeScore: null,
    poolEligible: true,
  });
  const fake = fakeStore(now, {
    snapshot: previous,
    rawPayloads: { "2026020009": { boxscore: { prior: true }, playByPlay: { prior: true } } },
    lastAttemptAt: "2026-10-01T15:55:00.000Z",
    lastSuccessAt: "2026-10-01T15:55:00.000Z",
    nextRefreshAt: null,
    error: null,
    refreshing: false,
    leaseExpiresAt: null,
  });
  const fetch: NhlFetch = async () => {
    throw new Error("sensitive upstream credentials and response body");
  };
  const service = new NhlSourceService({
    store: fake.store,
    fetch,
    now,
    timersEnabled: false,
  });

  await service.start();
  await service.refreshIfDue();
  const result = await service.getSnapshot();
  const after = fake.readCurrent()!;
  assert.deepEqual(after.snapshot, previous);
  assert.deepEqual(after.rawPayloads, {
    "2026020009": { boxscore: { prior: true }, playByPlay: { prior: true } },
  });
  assert.equal(result.status, "stale");
  assert.match(result.error ?? "", /Official NHL data could not be refreshed/);
  assert.doesNotMatch(result.error ?? "", /sensitive|credentials|response body/);
  assert.equal(after.refreshing, false);
  await service.stop();
});

test("cooldown and atomic lease permit only one overlapping refresh across service instances", async () => {
  const now = () => new Date(fixedNow);
  const fake = fakeStore(now);
  let callCount = 0;
  const fetch: NhlFetch = async (input) => {
    callCount += 1;
    const date = new URL(input).pathname.split("/").at(-1)!;
    return okResponse(scoreResponse(date));
  };
  const options = { store: fake.store, fetch, now, timersEnabled: false };
  const first = new NhlSourceService(options);
  const second = new NhlSourceService(options);
  await Promise.all([first.start(), second.start()]);
  await Promise.all([first.refreshIfDue(), second.refreshIfDue()]);

  assert.equal(callCount, 2);
  await first.refreshIfDue();
  await second.refreshIfDue();
  assert.equal(callCount, 2);
  assert.equal(fake.readCurrent()?.refreshing, false);
  await Promise.all([first.stop(), second.stop()]);
});

test("expired lease and cooldown allow a new token, while outdated workers cannot overwrite it", async () => {
  let clock = new Date(fixedNow);
  const now = () => new Date(clock);
  const fake = fakeStore(now);
  assert.equal(await fake.claim("old-worker", 300_000, 105_000), true);
  assert.equal(fake.readCurrent()?.error, null);
  assert.equal(await fake.claim("overlapping-worker", 300_000, 105_000), false);

  clock = new Date(fixedNow.getTime() + 300_000);
  assert.equal(await fake.claim("new-worker", 300_000, 105_000), true);
  await fake.succeed("old-worker", feedsForNow(), {});
  assert.equal(fake.readCurrent()?.snapshot, null);
  assert.equal(fake.readCurrent()?.error, null);
  await fake.succeed("new-worker", feedsForNow(), {});
  assert.deepEqual(fake.readCurrent()?.snapshot, feedsForNow());
});

test("an existing refresh error remains until a successful publication", async () => {
  const now = () => new Date(fixedNow);
  const fake = fakeStore(now, {
    snapshot: null,
    rawPayloads: {},
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextRefreshAt: null,
    error: "previous official refresh failed",
    refreshing: false,
    leaseExpiresAt: null,
  });
  assert.equal(await fake.claim("new-attempt", 300_000, 105_000), true);
  assert.equal(fake.readCurrent()?.error, "previous official refresh failed");
  await fake.succeed("new-attempt", feedsForNow());
  assert.equal(fake.readCurrent()?.error, null);
});

test("scheduler resumes a due refresh when a replica lease expires", async () => {
  let clock = new Date(fixedNow);
  const now = () => new Date(clock);
  const leaseRecord: NhlSourceCacheRecord = {
    snapshot: null,
    rawPayloads: {},
    lastAttemptAt: fixedNow.toISOString(),
    lastSuccessAt: null,
    nextRefreshAt: new Date(fixedNow.getTime() - 1_000).toISOString(),
    error: null,
    refreshing: true,
    leaseExpiresAt: new Date(fixedNow.getTime() + 10_000).toISOString(),
  };
  const fake = fakeStore(now, leaseRecord);
  const scheduler = new FakeScheduler();
  let calls = 0;
  const fetch: NhlFetch = async (input) => {
    calls += 1;
    return okResponse(scoreResponse(new URL(input).pathname.split("/").at(-1)!));
  };
  const service = new NhlSourceService({
    store: fake.store,
    fetch,
    now,
    scheduler,
  });

  await service.start();
  assert.equal(scheduler.nextDelay(), 10_000);
  clock = new Date(fixedNow.getTime() + 10_000);
  scheduler.runNext();
  await service.refreshIfDue();
  assert.equal(calls, 2);
  assert.equal(fake.readCurrent()?.refreshing, false);
  await service.stop();
});

test("a remotely advanced cooldown rearms the timer from its persisted lease and due times", async () => {
  let clock = new Date(fixedNow);
  const now = () => new Date(clock);
  const fake = fakeStore(now, {
    snapshot: null,
    rawPayloads: {},
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextRefreshAt: new Date(fixedNow.getTime() + 10_000).toISOString(),
    error: null,
    refreshing: false,
    leaseExpiresAt: null,
  });
  const scheduler = new FakeScheduler();
  let calls = 0;
  const service = new NhlSourceService({
    store: fake.store,
    fetch: async (input) => {
      calls += 1;
      return okResponse(scoreResponse(new URL(input).pathname.split("/").at(-1)!));
    },
    now,
    scheduler,
  });

  await service.start();
  assert.equal(scheduler.nextDelay(), 10_000);
  clock = new Date(fixedNow.getTime() + 10_000);
  assert.equal(await fake.claim("remote-replica", 300_000, 105_000), true);
  scheduler.runNext();
  await service.refreshIfDue();
  await flushSchedulerWork();
  assert.equal(calls, 0);
  assert.equal(scheduler.nextDelay(), 105_000);
  await service.stop();
});

test("read failure restores a bounded timer and refreshes after the cache becomes reachable", async () => {
  let clock = new Date(fixedNow);
  const now = () => new Date(clock);
  const fake = fakeStore(now, {
    snapshot: null,
    rawPayloads: {},
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextRefreshAt: new Date(fixedNow.getTime() + 10_000).toISOString(),
    error: null,
    refreshing: false,
    leaseExpiresAt: null,
  });
  const scheduler = new FakeScheduler();
  let calls = 0;
  const fetch: NhlFetch = async (input) => {
    calls += 1;
    return okResponse(scoreResponse(new URL(input).pathname.split("/").at(-1)!));
  };
  const service = new NhlSourceService({
    store: fake.store,
    fetch,
    now,
    scheduler,
  });

  await service.start();
  assert.equal(scheduler.nextDelay(), 10_000);
  fake.setReadFailure(true);
  clock = new Date(fixedNow.getTime() + 10_000);
  scheduler.runNext();
  await flushSchedulerWork();
  assert.equal(scheduler.nextDelay(), 15_000);
  const unavailable = await service.getSnapshot();
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.error ?? "", /retry shortly/);

  fake.setReadFailure(false);
  clock = new Date(clock.getTime() + 15_000);
  scheduler.runNext();
  await flushSchedulerWork();
  await service.refreshIfDue();
  assert.equal(calls, 2);
  assert.equal((await service.getSnapshot()).status, "available");
  await service.stop();
});

test("database acquisition failure returns an explicit unavailable response with retry guidance", async () => {
  const now = () => new Date(fixedNow);
  const fake = fakeStore(now);
  fake.setClaimFailure(true);
  const service = new NhlSourceService({
    store: fake.store,
    fetch: async () => {
      throw new Error("fetch should not run before a database claim");
    },
    now,
    timersEnabled: false,
  });

  await service.start();
  await service.refreshIfDue();
  const result = await service.getSnapshot();
  assert.equal(result.status, "unavailable");
  assert.match(result.error ?? "", /temporarily unavailable; retry shortly/);
  assert.doesNotMatch(result.error ?? "", /acquisition details/);
  await service.stop();
});

test("shutdown aborts pending upstream requests and retains the prior successful cache", async () => {
  const now = () => new Date(fixedNow);
  const prior = feedsForNow();
  const fake = fakeStore(now, {
    snapshot: prior,
    rawPayloads: {},
    lastAttemptAt: null,
    lastSuccessAt: fixedNow.toISOString(),
    nextRefreshAt: null,
    error: null,
    refreshing: false,
    leaseExpiresAt: null,
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const fetch: NhlFetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      markStarted();
      signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  const service = new NhlSourceService({
    store: fake.store,
    fetch,
    now,
    timersEnabled: false,
  });

  await service.start();
  const refresh = service.refreshIfDue();
  await started;
  await service.stop();
  await refresh;
  assert.deepEqual(fake.readCurrent()?.snapshot, prior);
  assert.equal(fake.readCurrent()?.refreshing, false);
});