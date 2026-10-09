import { NHL_TEAM_NAMES } from "../data/draft-roster-identities";
import { getPoolDates } from "@workspace/pool-calendar";
import type { DraftRoster } from "../data/draft-rosters";
import { loadDraftRosters } from "./draft-roster-store";
import {
  getTorontoDates,
  NHL_SEASON,
  type NhlDayFeed,
  type NhlSourceFeeds,
  type NhlSourceGame,
} from "./nhl-source-parser";
import {
  normalizeNhlGame,
  replacePerGameFact,
  type NormalizedNhlGame,
} from "./nhl-game-normalizer";
import {
  postgresNhlPoolScoringArchiveStore,
  type NhlPoolScoringArchiveStore,
  type NhlRawPayloads,
} from "./nhl-source-store";
import {
  scoreSkaterGame,
  type ScoringRules,
} from "./pool-scoring";
import { loadPersistedScoringRules } from "./scoring-rules-store";
import { applyOwnershipScore, fixedOwnershipScore, ownershipPoolDate, subtractOwnershipBaseline } from "./ownership-scoring";
import { ownershipGameEligibility } from "./pickup-eligibility";
import { resolvePendingPickups } from "./pending-pickups";

const SCHEDULE_URL = "https://api-web.nhle.com/v1/schedule";
const GAMECENTER_URL = "https://api-web.nhle.com/v1/gamecenter";
const MAX_SCHEDULE_PAGES_PER_REFRESH = 32;
const MAX_PENDING_GAMES_PER_REFRESH = 3;
const MAX_CORRECTION_RECHECKS_PER_REFRESH = 1;
const CORRECTION_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const SCHEDULE_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const SCHEDULE_RECHECK_DAYS = 7;
const MAX_RECENT_SCHEDULE_PAGES_PER_REFRESH = 3;
const MAX_AUDIT_SCHEDULE_PAGES_PER_REFRESH = 4;
const AUDIT_GAME_CONCURRENCY = 4;
const SEASON_AUDIT_VERSION = 2 as const;
const SEASON_AUDIT_START_DATE = "2026-09-29";
const REQUEST_TIMEOUT_MS = 13_000;
const ARCHIVE_FAILURE = "Official NHL scoring archive could not be refreshed; last good data was retained.";
const SOURCE_UNAVAILABLE = "Official NHL scoring data has not been successfully archived yet.";
const COVERAGE_PENDING = "Season coverage is still being backfilled; unverified rows are pending, not zero.";
const SCHEDULED_GAME_PENDING = "One or more eligible official NHL games are not fully verified yet.";
export const LIVE_PROVISIONAL_REASON =
  "Live provisional: verified live NHL events are included only as known subtotals; pending points are not included until official games and player facts are confirmed.";

export type PoolScoringStatus = "available" | "partial" | "unavailable" | "stale";

interface ScheduledPoolGame {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  gameState: string;
  startTimeUTC?: string | null;
  awayAbbrev: string;
  homeAbbrev: string;
  awayTeamId?: number;
  homeTeamId?: number;
  awayScore?: number;
  homeScore?: number;
}

export interface PoolScoringArchive {
  version: 1;
  season: 20262027;
  regularSeasonStartDate: string | null;
  scheduleCursor: string | null;
  noGamesBeforeStartConfirmedThrough: string | null;
  scheduleDates: Record<string, number[]>;
  scheduledGames: Record<string, ScheduledPoolGame>;
  gameFacts: Record<string, NormalizedNhlGame>;
  gameCheckedAt: Record<string, string>;
  revalidationCursor: number | null;
  scheduleRevalidatedAt: string | null;
  seasonAudit: SeasonAuditCheckpoint | null;
  sourceIssue: string | null;
}

interface SeasonAuditCheckpoint {
  version: typeof SEASON_AUDIT_VERSION;
  startDate: string;
  throughDate: string;
  scheduleCursor: string;
  scheduleComplete: boolean;
  gameIds: number[];
  checkedGameIds: number[];
  failedGameIds: number[];
  auditCheckedAt: string | null;
  summary: {
    scheduledFinalCount: number;
    verifiedFinalCount: number;
    failureCount: number;
    startDate: string;
    endDate: string;
    auditCheckedAt: string | null;
  };
}

export interface PoolScoringRow {
  ownerId: string;
  round: number;
  assetType: "skater" | "goalieTeam" | "goalie";
  nhlPlayerId: number | null;
  goals: number | null;
  assists: number | null;
  powerPlayGoals: number | null;
  shortHandedGoals: number | null;
  overtimeGoals: number | null;
  poolPoints: number | null;
  gamesPlayed: number | null;
  wins: number | null;
  shutouts: number | null;
}

export interface PoolScoringSnapshot {
  status: PoolScoringStatus;
  reason: string | null;
  asOf: string | null;
  season: 20262027;
  coverageThroughDate: string | null;
  rows: PoolScoringRow[];
}

export interface DailyPoolScoringSnapshot {
  date: string;
  status: "final" | "pending" | "unavailable";
  verifiedFinalCoverage?: boolean;
  summary: string;
  scoring: Array<{
    ownerId: string;
    ownerName: string;
    playerId: string;
    playerName: string;
    team: string;
    goals: number;
    assists: number;
    powerPlayGoals: number;
    shortHandedGoals: number;
    overtimeGoals: number;
    hatTrick: boolean;
    poolPoints: number;
    scoringBreakdown: Array<{
      label: string;
      count: number;
      points: number;
      note: string | null;
    }>;
  }>;
  owners: Array<{
    ownerId: string;
    ownerName: string;
    dailyPoints: number;
    seasonPoints: number;
    rank: number;
    previousRank: number | null;
    narrative: string;
    scoring: DailyPoolScoringSnapshot["scoring"];
  }>;
}

export type NhlJsonFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PoolScoringServiceOptions {
  store?: NhlPoolScoringArchiveStore;
  fetch?: NhlJsonFetch;
  now?: () => Date;
  loadRosters?: typeof loadDraftRosters;
  loadRules?: typeof loadPersistedScoringRules;
}

export interface LeaguePlayerIdentity {
  nhlPlayerId: number;
  team: string | null;
  position: "F" | "C" | "D" | "G";
}

export interface LeaguePlayerScore {
  nhlPlayerId: number;
  goals: number | null;
  assists: number | null;
  powerPlayGoals: number | null;
  shortHandedGoals: number | null;
  overtimeGoals: number | null;
  poolPoints: number | null;
  gamesPlayed: number | null;
  wins: number | null;
  shutouts: number | null;
  scoringStatus: "complete" | "partial" | "pending";
  reason: string | null;
}
export interface ArchivedLeaguePlayerIdentity {
  nhlPlayerId: number;
  team: string;
  position: "F" | "D" | "G";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function emptyArchive(): PoolScoringArchive {
  return {
    version: 1,
    season: NHL_SEASON,
    regularSeasonStartDate: null,
    scheduleCursor: null,
    noGamesBeforeStartConfirmedThrough: null,
    scheduleDates: {},
    scheduledGames: {},
    gameFacts: {},
    gameCheckedAt: {},
    revalidationCursor: null,
    scheduleRevalidatedAt: null,
    seasonAudit: null,
    sourceIssue: null,
  };
}

function isArchive(value: unknown): value is PoolScoringArchive {
  return record(value) &&
    value.version === 1 &&
    value.season === NHL_SEASON &&
    isDate(value.regularSeasonStartDate) || (
      record(value) &&
      value.version === 1 &&
      value.season === NHL_SEASON &&
      value.regularSeasonStartDate === null
    );
}

function archiveFrom(value: unknown): PoolScoringArchive {
  if (!isArchive(value)) return emptyArchive();
  const dates = record(value.scheduleDates) ? value.scheduleDates : {};
  const games = record(value.scheduledGames) ? value.scheduledGames : {};
  const facts = record(value.gameFacts) ? value.gameFacts : {};
  const checkedAt = record(value.gameCheckedAt) ? value.gameCheckedAt : {};
  return {
    version: 1,
    season: NHL_SEASON,
    regularSeasonStartDate: value.regularSeasonStartDate,
    scheduleCursor: isDate(value.scheduleCursor) ? value.scheduleCursor : null,
    noGamesBeforeStartConfirmedThrough: isDate(value.noGamesBeforeStartConfirmedThrough)
      ? value.noGamesBeforeStartConfirmedThrough
      : null,
    scheduleDates: Object.fromEntries(
      Object.entries(dates).filter((entry): entry is [string, number[]] =>
        isDate(entry[0]) && Array.isArray(entry[1]) &&
        entry[1].every(id => typeof id === "number" && Number.isSafeInteger(id)),
      ),
    ),
    scheduledGames: Object.fromEntries(
      Object.entries(games).filter(([key, game]) =>
        /^\d+$/.test(key) && record(game) &&
        game.id === Number(key) && isDate(game.gameDate),
      ).map(([key, game]) => {
        const scheduled = { ...(game as unknown as Record<string, unknown>) };
        for (const field of ["awayTeamId", "homeTeamId"] as const) {
          const value = scheduled[field];
          if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
            delete scheduled[field];
          }
        }
        for (const field of ["awayScore", "homeScore"] as const) {
          const value = scheduled[field];
          if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
            delete scheduled[field];
          }
        }
        return [key, scheduled];
      }),
    ) as unknown as Record<string, ScheduledPoolGame>,
    gameFacts: Object.fromEntries(
      Object.entries(facts).filter(([key, fact]) =>
        /^\d+$/.test(key) && record(fact) &&
        fact.gameId === Number(key) && isDate(fact.gameDate),
      ),
    ) as Record<string, NormalizedNhlGame>,
    gameCheckedAt: Object.fromEntries(
      Object.entries(checkedAt).filter(([key, time]) =>
        /^\d+$/.test(key) && typeof time === "string" && Number.isFinite(Date.parse(time)),
      ),
    ) as Record<string, string>,
    revalidationCursor:
      typeof value.revalidationCursor === "number" &&
      Number.isSafeInteger(value.revalidationCursor) &&
      value.revalidationCursor > 0
        ? value.revalidationCursor
        : null,
    scheduleRevalidatedAt: typeof value.scheduleRevalidatedAt === "string" &&
      Number.isFinite(Date.parse(value.scheduleRevalidatedAt))
      ? value.scheduleRevalidatedAt
      : null,
    seasonAudit: (() => {
      const audit = record(value.seasonAudit) ? value.seasonAudit : null;
      if (
        !audit ||
        audit.version !== SEASON_AUDIT_VERSION ||
        audit.startDate !== SEASON_AUDIT_START_DATE ||
        !isDate(audit.throughDate) ||
        !isDate(audit.scheduleCursor) ||
        typeof audit.scheduleComplete !== "boolean"
      ) return null;
      const ids = (candidate: unknown) => Array.isArray(candidate)
        ? [...new Set(candidate.filter((id): id is number =>
            typeof id === "number" && Number.isSafeInteger(id) && id > 0,
          ))]
        : [];
      const gameIds = ids(audit.gameIds);
      const checkedGameIds = ids(audit.checkedGameIds).filter(id => gameIds.includes(id));
      const failedGameIds = ids(audit.failedGameIds).filter(id =>
        gameIds.includes(id) && !checkedGameIds.includes(id),
      );
      const auditCheckedAt = typeof audit.auditCheckedAt === "string" &&
        Number.isFinite(Date.parse(audit.auditCheckedAt))
        ? audit.auditCheckedAt
        : null;
      return {
        version: SEASON_AUDIT_VERSION,
        startDate: SEASON_AUDIT_START_DATE,
        throughDate: audit.throughDate,
        scheduleCursor: audit.scheduleCursor,
        scheduleComplete: audit.scheduleComplete,
        gameIds,
        checkedGameIds,
        failedGameIds,
        auditCheckedAt,
        summary: {
          scheduledFinalCount: gameIds.length,
          verifiedFinalCount: checkedGameIds.length,
          failureCount: failedGameIds.length,
          startDate: SEASON_AUDIT_START_DATE,
          endDate: audit.throughDate,
          auditCheckedAt,
        },
      };
    })(),
    sourceIssue: typeof value.sourceIssue === "string" ? value.sourceIssue : null,
  };
}

async function fetchJson(
  fetchImpl: NhlJsonFetch,
  url: string,
  parentSignal?: AbortSignal,
): Promise<unknown> {
  if (parentSignal?.aborted) throw new Error("NHL scoring refresh cancelled.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("NHL scoring upstream request failed.");
    return await response.json();
  } catch {
    if (parentSignal?.aborted) throw new Error("NHL scoring refresh cancelled.");
    throw new Error("NHL scoring upstream request failed.");
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abort);
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(values.length, limit) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]!);
    }
  }));
  return results;
}

function parseScheduleGame(value: unknown, calendarDate: string): ScheduledPoolGame | null {
  if (!record(value)) throw new Error("Official NHL schedule contains an invalid game.");
  if (
    typeof value.season !== "number" ||
    !Number.isSafeInteger(value.season) ||
    typeof value.gameType !== "number" ||
    !Number.isSafeInteger(value.gameType)
  ) {
    throw new Error("Official NHL schedule game classification is incomplete.");
  }
  if (value.season !== NHL_SEASON || value.gameType !== 2) return null;
  if (
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    (value.gameDate !== undefined &&
      (!isDate(value.gameDate) || value.gameDate !== calendarDate)) ||
    typeof value.gameState !== "string" ||
    !value.gameState.trim() ||
    !record(value.awayTeam) ||
    !record(value.homeTeam) ||
    typeof value.awayTeam.abbrev !== "string" ||
    !value.awayTeam.abbrev.trim() ||
    typeof value.homeTeam.abbrev !== "string" ||
    !value.homeTeam.abbrev.trim()
  ) {
    throw new Error("Official NHL regular-season schedule game is incomplete or inconsistent.");
  }
  return {
    id: value.id,
    season: NHL_SEASON,
    gameType: 2,
    gameDate: value.gameDate === undefined ? calendarDate : value.gameDate,
    gameState: value.gameState,
    awayAbbrev: value.awayTeam.abbrev,
    homeAbbrev: value.homeTeam.abbrev,
    startTimeUTC: typeof value.startTimeUTC === "string" && Number.isFinite(Date.parse(value.startTimeUTC)) ? value.startTimeUTC : null,
  };
}

function parseSchedulePage(value: unknown, requestedStart: string) {
  if (
    !record(value) ||
    !Array.isArray(value.gameWeek) ||
    !isDate(value.nextStartDate) ||
    !isDate(value.regularSeasonStartDate)
  ) {
    throw new Error("Official NHL schedule response is incomplete.");
  }
  const days = new Map<string, number[]>();
  const games: ScheduledPoolGame[] = [];
  for (const day of value.gameWeek) {
    if (!record(day) || !isDate(day.date) || !Array.isArray(day.games)) {
      throw new Error("Official NHL schedule contains an invalid calendar day.");
    }
    const eligibleIds: number[] = [];
    for (const rawGame of day.games) {
      const game = parseScheduleGame(rawGame, day.date);
      if (!game) continue;
      games.push(game);
      eligibleIds.push(game.id);
    }
    days.set(day.date, eligibleIds);
  }
  if (days.size === 0 || !days.has(requestedStart)) {
    throw new Error("Official NHL schedule did not cover the requested week.");
  }
  return {
    nextStartDate: value.nextStartDate,
    regularSeasonStartDate: value.regularSeasonStartDate,
    days,
    games,
  };
}

function parseScheduleMetadata(value: unknown) {
  if (!record(value) || !isDate(value.regularSeasonStartDate)) {
    throw new Error("Official NHL regular-season schedule metadata is unavailable.");
  }
  return value.regularSeasonStartDate;
}

function scheduledGameFromScore(game: NhlSourceGame): ScheduledPoolGame {
  return {
    id: game.id,
    season: game.season,
    gameType: game.gameType,
    gameDate: game.gameDate,
    gameState: game.gameState,
    startTimeUTC: game.startTimeUTC,
    awayAbbrev: game.awayAbbrev,
    homeAbbrev: game.homeAbbrev,
    ...(game.awayScore !== null ? { awayScore: game.awayScore } : {}),
    ...(game.homeScore !== null ? { homeScore: game.homeScore } : {}),
  };
}

function replaceDayFromFeed(archive: PoolScoringArchive, feed: NhlDayFeed): void {
  const eligible = feed.games.filter(game =>
    game.season === NHL_SEASON && game.gameType === 2 && game.poolEligible,
  );
  archive.scheduleDates[feed.date] = eligible.map(game => game.id);
  for (const game of eligible) {
    archive.scheduledGames[String(game.id)] = scheduledGameFromScore(game);
  }
}

function normalizeExpectedGame(game: ScheduledPoolGame): Pick<
  NhlSourceGame,
  "id" | "season" | "gameType" | "gameDate" | "gameState" | "awayAbbrev" | "homeAbbrev"
> {
  return game;
}

function officialTeam(value: unknown, label: string) {
  if (
    !record(value) ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.abbrev !== "string" ||
    !value.abbrev ||
    typeof value.score !== "number" ||
    !Number.isSafeInteger(value.score) ||
    value.score < 0
  ) {
    throw new Error(`Official NHL gamecenter ${label} team metadata is incomplete.`);
  }
  return { id: value.id, abbrev: value.abbrev, score: value.score };
}

function reconcileGamecenterMetadata(
  game: ScheduledPoolGame,
  payload: { boxscore: unknown; playByPlay: unknown },
  prior: NormalizedNhlGame | undefined,
): ScheduledPoolGame {
  const boxscore = payload.boxscore;
  const playByPlay = payload.playByPlay;
  if (!record(boxscore) || !record(playByPlay)) {
    throw new Error("Official NHL gamecenter returned an invalid game.");
  }
  for (const response of [boxscore, playByPlay]) {
    if (
      response.id !== game.id ||
      response.season !== game.season ||
      response.gameType !== game.gameType ||
      response.gameDate !== game.gameDate
    ) {
      throw new Error("Official NHL gamecenter metadata does not match the scheduled game.");
    }
  }
  if (
    typeof boxscore.gameState !== "string" ||
    !boxscore.gameState.trim()
  ) {
    throw new Error("Official NHL gamecenter state is unavailable.");
  }
  const gameState = boxscore.gameState.trim().toUpperCase();
  if (
    playByPlay.gameState !== undefined &&
    (typeof playByPlay.gameState !== "string" ||
      playByPlay.gameState.trim().toUpperCase() !== gameState)
  ) {
    throw new Error("Official NHL box score and play-by-play game states disagree.");
  }

  const away = officialTeam(boxscore.awayTeam, "away");
  const home = officialTeam(boxscore.homeTeam, "home");
  if (
    away.abbrev !== game.awayAbbrev ||
    home.abbrev !== game.homeAbbrev ||
    (game.awayTeamId !== undefined && away.id !== game.awayTeamId) ||
    (game.homeTeamId !== undefined && home.id !== game.homeTeamId) ||
    (prior && (away.id !== prior.awayTeamId || home.id !== prior.homeTeamId))
  ) {
    throw new Error("Official NHL gamecenter teams do not match the scheduled game.");
  }

  for (const [label, team, official] of [
    ["away", playByPlay.awayTeam, away],
    ["home", playByPlay.homeTeam, home],
  ] as const) {
    if (team === undefined) continue;
    if (
      !record(team) ||
      team.id !== official.id ||
      team.abbrev !== official.abbrev ||
      (team.score !== undefined && team.score !== official.score)
    ) {
      throw new Error(`Official NHL play-by-play ${label} team metadata disagrees with the box score.`);
    }
  }

  return {
    ...game,
    gameState,
    awayTeamId: away.id,
    homeTeamId: home.id,
    awayScore: away.score,
    homeScore: home.score,
  };
}

function markPriorFactUnverified(
  archive: PoolScoringArchive,
  gameId: number,
  reason: string,
): void {
  const prior = archive.gameFacts[String(gameId)];
  if (!prior || (prior.verified && prior.final)) return;
  archive.gameFacts[String(gameId)] = { ...prior, verified: false, reason };
}

function normalizeAndReplace(
  archive: PoolScoringArchive,
  game: ScheduledPoolGame,
  payload: { boxscore: unknown; playByPlay: unknown },
  checkedAt: string,
): boolean {
  const prior = archive.gameFacts[String(game.id)];
  const reconciledGame = reconcileGamecenterMetadata(game, payload, prior);
  const normalized = normalizeNhlGame(
    normalizeExpectedGame(reconciledGame),
    payload.boxscore,
    payload.playByPlay,
  );
  if (!normalized.verified && prior?.verified && prior.final) {
    archive.sourceIssue = `Correction for game ${game.id} did not validate; last verified facts were retained.`;
    return false;
  }
  // Game ID is the natural idempotency key: corrections replace, never add.
  archive.scheduledGames[String(game.id)] = reconciledGame;
  replacePerGameFact(archive.gameFacts, normalized);
  if (normalized.verified) archive.gameCheckedAt[String(game.id)] = checkedAt;
  return normalized.verified;
}

function scoreFeedFacts(
  archive: PoolScoringArchive,
  feeds: NhlSourceFeeds,
  rawPayloads: NhlRawPayloads,
  checkedAt: string,
): boolean {
  let failed = false;
  replaceDayFromFeed(archive, feeds.lastNight);
  replaceDayFromFeed(archive, feeds.today);
  for (const game of [...feeds.lastNight.games, ...feeds.today.games]) {
    if (
      game.season !== NHL_SEASON ||
      game.gameType !== 2 ||
      !game.poolEligible
    ) continue;
    const raw = rawPayloads[String(game.id)];
    if (!raw) continue;
    try {
      if (!normalizeAndReplace(archive, scheduledGameFromScore(game), raw, checkedAt)) {
        failed = true;
      }
    } catch {
      markPriorFactUnverified(
        archive,
        game.id,
        "Official NHL gamecenter metadata could not be reconciled with the scheduled game.",
      );
      archive.sourceIssue = "At least one rolling NHL box score and play-by-play pair did not validate.";
      failed = true;
    }
  }
  return failed;
}

async function backfillSchedule(
  archive: PoolScoringArchive,
  today: string,
  fetchImpl: NhlJsonFetch,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!archive.regularSeasonStartDate) {
    const metadata = await fetchJson(fetchImpl, `${SCHEDULE_URL}/${today}`, signal);
    archive.regularSeasonStartDate = parseScheduleMetadata(metadata);
    if (archive.regularSeasonStartDate > today) {
      archive.noGamesBeforeStartConfirmedThrough = today;
      archive.scheduleCursor = archive.regularSeasonStartDate;
      return false;
    }
    archive.scheduleCursor = archive.regularSeasonStartDate;
  }

  const cursor = archive.scheduleCursor;
  if (!cursor || cursor > today) {
    if (archive.regularSeasonStartDate > today) {
      archive.noGamesBeforeStartConfirmedThrough = today;
    }
    return false;
  }

  const cursors: string[] = [];
  for (
    let pageStart = cursor;
    pageStart <= today && cursors.length < MAX_SCHEDULE_PAGES_PER_REFRESH;
    pageStart = addDays(pageStart, 7)
  ) {
    cursors.push(pageStart);
  }
  const responses = await mapWithConcurrency(cursors, 4, async pageStart => {
    try {
      return {
        pageStart,
        body: await fetchJson(fetchImpl, `${SCHEDULE_URL}/${pageStart}`, signal),
        failed: false,
      };
    } catch {
      return { pageStart, body: null, failed: true };
    }
  });

  let nextCursor = cursor;
  let gapFound = false;
  for (const response of responses) {
    try {
      if (response.failed || response.body === null) {
        throw new Error("Official NHL schedule page is unavailable.");
      }
      const parsed = parseSchedulePage(response.body, response.pageStart);
      archive.regularSeasonStartDate = parsed.regularSeasonStartDate;
      for (const [date, ids] of parsed.days) {
        if (date <= today) archive.scheduleDates[date] = ids;
      }
      for (const game of parsed.games) {
        if (game.gameDate <= today) archive.scheduledGames[String(game.id)] = game;
      }
      if (!gapFound) nextCursor = parsed.nextStartDate;
    } catch {
      if (!gapFound) {
        nextCursor = response.pageStart;
        gapFound = true;
      }
    }
  }
  archive.scheduleCursor = nextCursor;
  if (gapFound) {
    archive.sourceIssue = "Official NHL schedule backfill hit an upstream page gap.";
  }
  return gapFound;
}

function updateSeasonAuditSummary(audit: SeasonAuditCheckpoint): void {
  audit.summary = {
    scheduledFinalCount: audit.gameIds.length,
    verifiedFinalCount: audit.checkedGameIds.length,
    failureCount: audit.failedGameIds.length,
    startDate: audit.startDate,
    endDate: audit.throughDate,
    auditCheckedAt: audit.auditCheckedAt,
  };
}

async function reconcileSeasonAudit(
  archive: PoolScoringArchive,
  today: string,
  fetchImpl: NhlJsonFetch,
  checkedAt: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (archive.seasonAudit?.auditCheckedAt) return false;
  let audit = archive.seasonAudit;
  if (!audit) {
    audit = {
      version: SEASON_AUDIT_VERSION,
      startDate: SEASON_AUDIT_START_DATE,
      throughDate: today,
      scheduleCursor: SEASON_AUDIT_START_DATE,
      scheduleComplete: false,
      gameIds: [],
      checkedGameIds: [],
      failedGameIds: [],
      auditCheckedAt: null,
      summary: {
        scheduledFinalCount: 0,
        verifiedFinalCount: 0,
        failureCount: 0,
        startDate: SEASON_AUDIT_START_DATE,
        endDate: today,
        auditCheckedAt: null,
      },
    };
    archive.seasonAudit = audit;
  } else if (today > audit.throughDate) {
    audit.throughDate = today;
    audit.scheduleComplete = false;
    audit.scheduleCursor = audit.scheduleCursor > audit.throughDate
      ? audit.throughDate
      : audit.scheduleCursor;
  }

  let failed = false;
  for (
    let page = 0;
    !audit.scheduleComplete && page < MAX_AUDIT_SCHEDULE_PAGES_PER_REFRESH;
    page++
  ) {
    let parsed;
    try {
      const body = await fetchJson(
        fetchImpl,
        `${SCHEDULE_URL}/${audit.scheduleCursor}`,
        signal,
      );
      parsed = parseSchedulePage(body, audit.scheduleCursor);
      if (parsed.regularSeasonStartDate !== SEASON_AUDIT_START_DATE) {
        throw new Error("Official NHL regular-season start does not match the confirmed audit start.");
      }
    } catch {
      archive.sourceIssue = "Official NHL season audit schedule could not be verified.";
      failed = true;
      break;
    }

    for (const [date, ids] of parsed.days) {
      if (date < audit.startDate || date > audit.throughDate) continue;
      archive.scheduleDates[date] = ids;
    }
    for (const game of parsed.games) {
      if (game.gameDate < audit.startDate || game.gameDate > audit.throughDate) continue;
      archive.scheduledGames[String(game.id)] = game;
    }
    if (parsed.days.has(audit.throughDate)) {
      audit.scheduleComplete = true;
      const gameIds = Object.values(archive.scheduledGames)
        .filter(game =>
          game.gameDate >= audit.startDate &&
          game.gameDate <= audit.throughDate &&
          ["FINAL", "OFF"].includes(game.gameState.toUpperCase()),
        )
        .map(game => game.id)
        .sort((a, b) => a - b);
      audit.gameIds = [...new Set(gameIds)];
      audit.checkedGameIds = audit.checkedGameIds.filter(id => audit.gameIds.includes(id));
      audit.failedGameIds = audit.failedGameIds.filter(id => audit.gameIds.includes(id));
    } else {
      const previousCursor = audit.scheduleCursor;
      audit.scheduleCursor = parsed.nextStartDate;
      if (parsed.nextStartDate <= previousCursor) {
        archive.sourceIssue = "Official NHL season audit schedule cursor did not advance.";
        failed = true;
        break;
      }
    }
  }

  if (!audit.scheduleComplete) {
    if (!failed) {
      archive.sourceIssue = "Official NHL season audit schedule is still being backfilled.";
      failed = true;
    }
    updateSeasonAuditSummary(audit);
    return failed;
  }
  archive.scheduleRevalidatedAt = checkedAt;

  const gamesToCheck = audit.gameIds.filter(id => !audit.checkedGameIds.includes(id));
  const requests = gamesToCheck.flatMap(gameId => [
    { gameId, kind: "boxscore" as const },
    { gameId, kind: "play-by-play" as const },
  ]);
  const responses = await mapWithConcurrency(requests, AUDIT_GAME_CONCURRENCY, async request => {
    try {
      return {
        ...request,
        body: await fetchJson(
          fetchImpl,
          `${GAMECENTER_URL}/${request.gameId}/${request.kind}`,
          signal,
        ),
      };
    } catch {
      return { ...request, body: null };
    }
  });
  const byGameId = new Map<number, { boxscore: unknown; playByPlay: unknown }>();
  for (const response of responses) {
    if (response.body === null) continue;
    const payload = byGameId.get(response.gameId) ?? { boxscore: null, playByPlay: null };
    payload[response.kind === "boxscore" ? "boxscore" : "playByPlay"] = response.body;
    byGameId.set(response.gameId, payload);
  }

  for (const gameId of gamesToCheck) {
    const game = archive.scheduledGames[String(gameId)];
    const payload = byGameId.get(gameId);
    if (!game || !payload?.boxscore || !payload.playByPlay) {
      audit.failedGameIds = [...new Set([...audit.failedGameIds, gameId])];
      failed = true;
      continue;
    }
    try {
      if (!normalizeAndReplace(archive, game, payload, checkedAt)) {
        audit.failedGameIds = [...new Set([...audit.failedGameIds, gameId])];
        failed = true;
        continue;
      }
      audit.checkedGameIds.push(gameId);
      audit.failedGameIds = audit.failedGameIds.filter(id => id !== gameId);
    } catch {
      audit.failedGameIds = [...new Set([...audit.failedGameIds, gameId])];
      archive.sourceIssue = "At least one season-audit gamecenter pair did not validate.";
      failed = true;
    }
  }
  audit.checkedGameIds = [...new Set(audit.checkedGameIds)].sort((a, b) => a - b);
  if (audit.checkedGameIds.length === audit.gameIds.length && audit.failedGameIds.length === 0) {
    audit.auditCheckedAt = checkedAt;
    archive.sourceIssue = null;
  } else {
    archive.sourceIssue = "Official NHL season audit is incomplete; failed games will be retried.";
    failed = true;
  }
  updateSeasonAuditSummary(audit);
  return failed;
}

async function backfillRecentSchedule(
  archive: PoolScoringArchive,
  today: string,
  fetchImpl: NhlJsonFetch,
  checkedAt: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const lastChecked = archive.scheduleRevalidatedAt
    ? Date.parse(archive.scheduleRevalidatedAt)
    : Number.NaN;
  if (Number.isFinite(lastChecked) &&
      Date.parse(checkedAt) - lastChecked < SCHEDULE_RECHECK_INTERVAL_MS) {
    return false;
  }

  const start = addDays(today, -(SCHEDULE_RECHECK_DAYS - 1));
  let cursor = start;
  for (let page = 0; page < MAX_RECENT_SCHEDULE_PAGES_PER_REFRESH; page++) {
    try {
      const body = await fetchJson(fetchImpl, `${SCHEDULE_URL}/${cursor}`, signal);
      const parsed = parseSchedulePage(body, cursor);
      if (parsed.regularSeasonStartDate !== SEASON_AUDIT_START_DATE) {
        throw new Error("Official NHL regular-season start changed unexpectedly.");
      }
      archive.regularSeasonStartDate = parsed.regularSeasonStartDate;
      for (const [date, ids] of parsed.days) {
        if (date >= start && date <= today) archive.scheduleDates[date] = ids;
      }
      for (const game of parsed.games) {
        if (game.gameDate >= start && game.gameDate <= today) {
          archive.scheduledGames[String(game.id)] = game;
        }
      }
      if (parsed.days.has(today)) {
        archive.scheduleRevalidatedAt = checkedAt;
        return false;
      }
      if (parsed.nextStartDate <= cursor) {
        throw new Error("Official NHL recent-schedule cursor did not advance.");
      }
      cursor = parsed.nextStartDate;
    } catch {
      archive.sourceIssue = "Official NHL recent schedule could not be refreshed.";
      return true;
    }
  }
  archive.sourceIssue = "Official NHL recent schedule coverage is still pending.";
  return true;
}

async function backfillGameFacts(
  archive: PoolScoringArchive,
  today: string,
  fetchImpl: NhlJsonFetch,
  checkedAt: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const eligibleGames = Object.values(archive.scheduledGames).filter(game =>
    game.gameDate <= today &&
    ["LIVE", "CRIT", "FINAL", "OFF"].includes(game.gameState),
  );
  const pendingGames = eligibleGames
    .filter(game => {
      const fact = archive.gameFacts[String(game.id)];
      return !fact || !fact.verified || !fact.final ||
        (fact.verified && fact.final && fact.goalieResultsComplete !== true);
    })
    .sort((a, b) => {
      const aLive = a.gameState === "LIVE" || a.gameState === "CRIT";
      const bLive = b.gameState === "LIVE" || b.gameState === "CRIT";
      if (aLive !== bLive) return aLive ? -1 : 1;
      return aLive
        ? b.gameDate.localeCompare(a.gameDate) || a.id - b.id
        : a.gameDate.localeCompare(b.gameDate) || a.id - b.id;
    })
    .slice(0, MAX_PENDING_GAMES_PER_REFRESH);

  const nowMs = Date.parse(checkedAt);
  const correctionCandidates = eligibleGames
    .filter(game => {
      const fact = archive.gameFacts[String(game.id)];
      if (!fact?.verified || !fact.final) return false;
      const lastChecked = archive.gameCheckedAt[String(game.id)];
      return !lastChecked ||
        nowMs - Date.parse(lastChecked) >= CORRECTION_RECHECK_INTERVAL_MS;
    })
    .sort((a, b) => a.id - b.id);
  const correctionAfterCursor = correctionCandidates.filter(game =>
    archive.revalidationCursor === null || game.id > archive.revalidationCursor,
  );
  const correctionGames = correctionAfterCursor.length
    ? correctionAfterCursor.slice(0, MAX_CORRECTION_RECHECKS_PER_REFRESH)
    : correctionCandidates.slice(0, MAX_CORRECTION_RECHECKS_PER_REFRESH);
  for (const game of correctionGames) {
    archive.revalidationCursor = game.id;
  }

  const selectedGames = [
    ...pendingGames,
    ...correctionGames.filter(game =>
      !pendingGames.some(pending => pending.id === game.id),
    ),
  ];
  const fetched = await mapWithConcurrency(selectedGames, 4, async game => {
    try {
      const [boxscore, playByPlay] = await Promise.all([
        fetchJson(fetchImpl, `${GAMECENTER_URL}/${game.id}/boxscore`, signal),
        fetchJson(fetchImpl, `${GAMECENTER_URL}/${game.id}/play-by-play`, signal),
      ]);
      return { game, payload: { boxscore, playByPlay } };
    } catch {
      return { game, payload: null };
    }
  });
  const payloadById = new Map<number, { boxscore: unknown; playByPlay: unknown }>(
    fetched.filter(
      (value): value is typeof value & { payload: { boxscore: unknown; playByPlay: unknown } } =>
        value.payload !== null,
    ).map(value => [value.game.id, value.payload]),
  );
  let failed = false;
  for (const game of selectedGames) {
    const payload = payloadById.get(game.id);
    if (!payload) {
      archive.sourceIssue = "Historical official gamecenter data is still pending.";
      failed = true;
      continue;
    }
    try {
      if (!normalizeAndReplace(archive, game, payload, checkedAt)) failed = true;
    } catch {
      markPriorFactUnverified(
        archive,
        game.id,
        "Official NHL gamecenter metadata could not be reconciled with the scheduled game.",
      );
      archive.sourceIssue = "At least one historical official gamecenter game did not validate.";
      failed = true;
    }
  }
  return failed;
}

function coverageThroughDate(archive: PoolScoringArchive, today: string): string | null {
  if (archive.seasonAudit && !archive.seasonAudit.scheduleComplete) return null;
  if (
    archive.regularSeasonStartDate &&
    archive.regularSeasonStartDate > today &&
    archive.noGamesBeforeStartConfirmedThrough === today
  ) {
    return today;
  }
  const start = archive.regularSeasonStartDate;
  if (!start) return null;
  let lastComplete: string | null = null;
  for (let date = start, checks = 0; date <= today && checks < 400; date = addDays(date, 1), checks++) {
    const gameIds = archive.scheduleDates[date];
    if (!gameIds) break;
    const allGamesVerified = gameIds.every(id => {
      const fact = archive.gameFacts[String(id)];
      return Boolean(fact?.verified && fact.final);
    });
    if (!allGamesVerified) break;
    lastComplete = date;
  }
  return lastComplete;
}

export function verifiedCoverageThroughDate(
  snapshot: unknown,
  throughDate: string,
): string | null {
  return coverageThroughDate(archiveFrom(snapshot), throughDate);
}

function hasCompletePriorCoverage(
  archive: PoolScoringArchive,
  today: string,
  yesterday: string,
): boolean {
  if (
    archive.regularSeasonStartDate &&
    archive.regularSeasonStartDate > today &&
    archive.noGamesBeforeStartConfirmedThrough === today
  ) return true;
  const through = coverageThroughDate(archive, today);
  return Boolean(through && through >= yesterday);
}

export function teamAbbreviation(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  const abbreviation = teamName.trim().toUpperCase();
  if (Object.hasOwn(NHL_TEAM_NAMES, abbreviation)) return abbreviation;
  const normalized = teamName.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  return Object.entries(NHL_TEAM_NAMES).find(([, name]) =>
    name.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase() === normalized,
  )?.[0] ?? null;
}

export function rowsForRosters(
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>,
  archive: PoolScoringArchive,
  rules: ScoringRules | null,
  canAssertZero: boolean,
  ownershipDate?: string,
): PoolScoringRow[] {
  const games = Object.values(archive.gameFacts).sort((a, b) =>
    a.gameDate.localeCompare(b.gameDate) || a.gameId - b.gameId,
  );
  const rows: PoolScoringRow[] = [];
  for (const owner of rosters) {
    for (const selection of owner.selections) {
      const fixed = selection.assetType === "skater" ? fixedOwnershipScore(selection, ownershipDate) : null;
      if (fixed) {
        rows.push({ ownerId: owner.id, round: selection.round, assetType: "skater",
          nhlPlayerId: selection.nhlPlayerId ?? null, ...fixed });
        continue;
      }
      if (selection.assetType === "goalieTeam") {
        const photoGoalies = selection.goalies ?? [];
        if (selection.goalieNamesPending || photoGoalies.length === 0) {
          rows.push({
            ownerId: owner.id,
            round: selection.round,
            assetType: "goalie",
            nhlPlayerId: null,
            goals: null,
            assists: null,
            powerPlayGoals: null,
            shortHandedGoals: null,
            overtimeGoals: null,
            poolPoints: null,
            gamesPlayed: null,
            wins: null,
            shutouts: null,
          });
          continue;
        }
        for (const goalie of photoGoalies) {
          const fixed = fixedOwnershipScore({ ...selection,
            frozenScoring: selection.frozenGoalieScoring?.[String(goalie.nhlPlayerId)] }, ownershipDate);
          if (fixed) {
            rows.push({ ownerId: owner.id, round: selection.round, assetType: "goalie", nhlPlayerId: goalie.nhlPlayerId, ...fixed });
            continue;
          }
          let goals = 0;
          let assists = 0;
          let gamesPlayed = 0;
          let wins = 0;
          let shutouts = 0;
          let points = 0;
          let pending = rules === null;
          let pendingStatFacts = false;
          let pendingResultFacts = false;
          const confirmedAbbrev = teamAbbreviation(goalie.confirmedTeam);
          for (const game of games) {
            const eligible = ownershipGameEligibility(selection, game.gameId, game.gameDate, archive.scheduledGames?.[String(game.gameId)]?.startTimeUTC);
            if (eligible === false) continue;
            if (eligible === null) { pendingStatFacts = true; continue; }
            const player = game.players[String(goalie.nhlPlayerId)];
            const relevantTeam = confirmedAbbrev !== null &&
              (game.homeTeamAbbrev === confirmedAbbrev ||
                game.awayTeamAbbrev === confirmedAbbrev);
            if (!game.verified) {
              if (player || relevantTeam) pendingStatFacts = true;
              continue;
            }
            if (
              !game.goalieResultsComplete &&
              relevantTeam
            ) {
              pendingResultFacts = true;
            }
            if (!player || player.position !== "G") continue;
            goals += player.goals.length;
            assists += player.assists;
            if (player.goalieAppeared === true) gamesPlayed++;
            if (!rules) continue;

            points += player.goals.length * rules.goalieGoal;
            points += player.assists * rules.goalieAssist;
            if (!game.final) {
              pendingResultFacts = true;
              continue;
            }
            if (game.goalieResultsComplete !== true) {
              pendingResultFacts = true;
              continue;
            }
            if (player.goalieAppeared === false) continue;
            if (player.goalieDecision === "W") {
              wins++;
              if (player.goalieShutoutWin === true) {
                shutouts++;
                points += rules.goalieTeamShutoutWin;
              } else if (player.goalieShutoutWin === false) {
                points += rules.goalieTeamWin;
              } else {
                pending = true;
              }
            } else if (
              player.goalieDecision === "L" ||
              player.goalieDecision === "O" ||
              (player.goalieDecision === null && player.goalieAppeared === true)
            ) {
              // A verified game has one official winner. An appearing goalie
              // with no decision (e.g. a pulled starter) receives no win points.
            } else {
              pendingResultFacts = true;
            }
          }
          pending ||= pendingResultFacts || pendingStatFacts;
          rows.push({
            ownerId: owner.id,
            round: selection.round,
            assetType: "goalie",
            nhlPlayerId: goalie.nhlPlayerId,
            goals: !pendingStatFacts && (canAssertZero || goals > 0) ? goals : null,
            assists: !pendingStatFacts && (canAssertZero || assists > 0) ? assists : null,
            powerPlayGoals: null,
            shortHandedGoals: null,
            overtimeGoals: null,
            poolPoints: rules !== null &&
              (points > 0 || (
                canAssertZero &&
                !pending &&
                !pendingResultFacts &&
                !pendingStatFacts
              ))
              ? points
              : null,
            gamesPlayed: !pendingResultFacts && !pendingStatFacts &&
              (canAssertZero || gamesPlayed > 0)
              ? gamesPlayed
              : null,
            wins: !pendingResultFacts && !pendingStatFacts && (canAssertZero || wins > 0)
              ? wins
              : null,
            shutouts: !pendingResultFacts && !pendingStatFacts &&
              (canAssertZero || shutouts > 0)
              ? shutouts
              : null,
          });
        }
        continue;
      }

      const nhlPlayerId = selection.nhlPlayerId ?? null;
      if (nhlPlayerId === null) {
        rows.push({
          ownerId: owner.id,
          round: selection.round,
          assetType: "skater",
          nhlPlayerId: null,
          goals: null,
          assists: null,
          powerPlayGoals: null,
          shortHandedGoals: null,
          overtimeGoals: null,
          poolPoints: null,
          gamesPlayed: null,
          wins: null,
          shutouts: null,
        });
        continue;
      }

      let goals = 0;
      let assists = 0;
      let powerPlayGoals = 0;
      let shortHandedGoals = 0;
      let overtimeGoals = 0;
      let gamesPlayed = 0;
      let points = 0;
      let pendingPoints = rules === null;
      let pendingGameFacts = false;
      const excludedGames = new Set(selection.scoringExcludedGameIds ?? []);
      for (const game of games) {
        if (excludedGames.has(game.gameId)) continue;
        const eligible = ownershipGameEligibility(selection, game.gameId, game.gameDate,
          archive.scheduledGames[String(game.gameId)]?.startTimeUTC);
        if (eligible === false) continue;
        if (eligible === null) {
          if (game.players[String(nhlPlayerId)] || teamAbbreviation(selection.confirmedTeam) === game.homeTeamAbbrev ||
              teamAbbreviation(selection.confirmedTeam) === game.awayTeamAbbrev) pendingGameFacts = true;
          continue;
        }
        const selectedTeam = teamAbbreviation(selection.confirmedTeam);
        if (
          !game.verified &&
          (game.players[String(nhlPlayerId)] ||
            selectedTeam === game.homeTeamAbbrev ||
            selectedTeam === game.awayTeamAbbrev)
        ) {
          pendingGameFacts = true;
        }
        const player = game.players[String(nhlPlayerId)];
        if (!player || player.position === "G") continue;
        gamesPlayed++;
        goals += player.goals.length;
        assists += player.assists;
        powerPlayGoals += player.goals.filter(goal => goal.powerPlay).length;
        shortHandedGoals += player.goals.filter(goal => goal.shortHanded).length;
        overtimeGoals += player.goals.filter(goal => goal.overtime).length;
        if (!rules || (player.position !== "F" && player.position !== "D")) {
          pendingPoints = true;
          continue;
        }
        const scored = scoreSkaterGame(player.position, player.goals, player.assists, rules);
        if (scored.poolPoints === null) pendingPoints = true;
        else points += scored.poolPoints;
      }
      rows.push(applyOwnershipScore(selection, {
        ownerId: owner.id,
        round: selection.round,
        assetType: "skater",
        nhlPlayerId,
        goals: (canAssertZero && !pendingGameFacts) || goals > 0 ? goals : null,
        assists: (canAssertZero && !pendingGameFacts) || assists > 0 ? assists : null,
        powerPlayGoals: (canAssertZero && !pendingGameFacts) || powerPlayGoals > 0 ? powerPlayGoals : null,
        shortHandedGoals: (canAssertZero && !pendingGameFacts) || shortHandedGoals > 0 ? shortHandedGoals : null,
        overtimeGoals: (canAssertZero && !pendingGameFacts) || overtimeGoals > 0 ? overtimeGoals : null,
        poolPoints: !pendingPoints && !pendingGameFacts && (canAssertZero || points > 0) ? points : null,
        gamesPlayed: ((canAssertZero && !pendingGameFacts) || gamesPlayed > 0) ? gamesPlayed : null,
        wins: null,
        shutouts: null,
      }, ownershipDate));
    }
  }
  return rows;
}

function unresolvedRowReasons(
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>,
  archive: PoolScoringArchive,
  rules: ScoringRules | null,
): string[] {
  const reasons: string[] = [];
  const games = Object.values(archive.gameFacts);
  for (const owner of rosters) {
    for (const selection of owner.selections) {
      if (selection.assetType === "goalieTeam") {
        continue;
      }
      const playerId = selection.nhlPlayerId;
      if (!playerId) {
        reasons.push(`Owner ${owner.id}, round ${selection.round} has an unresolved NHL player identity.`);
        continue;
      }
      const selectedTeam = teamAbbreviation(selection.confirmedTeam);
      for (const game of games) {
        if (!game.verified &&
            (game.players[String(playerId)] ||
              selectedTeam === game.homeTeamAbbrev ||
              selectedTeam === game.awayTeamAbbrev)) {
          reasons.push(
            `Owner ${owner.id}, round ${selection.round}, game ${game.gameId}: official event totals are unverified.`,
          );
        }
        const player = game.players[String(playerId)];
        if (!player || player.position === "G" || !rules) continue;
        const scored = scoreSkaterGame(player.position, player.goals, player.assists, rules);
        if (scored.poolPoints === null) {
          reasons.push(
            `Owner ${owner.id}, round ${selection.round}, game ${game.gameId}: ${scored.pendingReason}`,
          );
        }
      }
    }
  }
  return reasons;
}

function pendingGoalieNameReasons(
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>,
): string[] {
  const pendingSlots = rosters.reduce((count, owner) =>
    count + owner.selections.filter(selection =>
      selection.assetType === "goalieTeam" &&
      (selection.goalieNamesPending || !selection.goalies?.length),
    ).length,
  0);
  return pendingSlots === 0
    ? []
    : [`${pendingSlots} goalie slots have no photo-confirmed individual goalie names and are not scored. Clubs are draft references only.`];
}

function pendingGoalieFactReasons(archive: PoolScoringArchive): string[] {
  const gameIds = Object.values(archive.gameFacts)
    .filter(game => game.final && game.goalieResultsComplete !== true)
    .map(game => game.gameId)
    .sort((a, b) => a - b);
  if (gameIds.length === 0) return [];
  const shownIds = gameIds.slice(0, 8).join(", ");
  const more = gameIds.length > 8 ? `, +${gameIds.length - 8} more` : "";
  return [
    `${gameIds.length} games await official individual goalie appearance/decision/shutout verification (IDs: ${shownIds}${more}).`,
  ];
}

function uniqueReasons(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function ownerRanks(totals: Map<string, number>): Map<string, number> {
  const sorted = [...totals.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const ranks = new Map<string, number>();
  let previousPoints: number | null = null;
  let previousRank = 0;
  for (const [index, [ownerId, points]] of sorted.entries()) {
    const rank = points === previousPoints ? previousRank : index + 1;
    ranks.set(ownerId, rank);
    previousPoints = points;
    previousRank = rank;
  }
  return ranks;
}

function goalScoringBreakdown(
  position: "F" | "D",
  goals: readonly import("./pool-scoring").ScoringGoal[],
  assists: number,
  rules: ScoringRules,
  scored: ReturnType<typeof scoreSkaterGame>,
) {
  const breakdown: DailyPoolScoringSnapshot["scoring"][number]["scoringBreakdown"] = [];
  if (scored.hatTrick) {
    const hatTrickBase = position === "D" ? rules.defensemanHatTrick : rules.forwardHatTrick;
    breakdown.push({ label: "Hat trick", count: 1, points: hatTrickBase, note: null });
    const ppCount = goals.filter(goal => goal.powerPlay).length;
    if (ppCount > 0 && rules.powerPlayBonusOnHatTrick) {
      breakdown.push({
        label: "Power-play goal bonus",
        count: ppCount,
        points: ppCount * (rules.powerPlayGoal - rules.goal),
        note: null,
      });
    }
  } else {
    for (const goal of goals) {
      if (goal.shortHanded) {
        breakdown.push({ label: "Short-handed goal", count: 1, points: rules.shortHandedGoal, note: null });
      } else if (goal.overtime) {
        breakdown.push({ label: "Overtime goal", count: 1, points: rules.overtimeGoal, note: null });
        if (goal.powerPlay && rules.powerPlayBonusOnOvertime) {
          breakdown.push({
            label: "Power-play goal bonus",
            count: 1,
            points: rules.powerPlayGoal - rules.goal,
            note: "Power-play overtime bonus",
          });
        }
      } else if (goal.powerPlay) {
        breakdown.push({ label: "Power-play goal", count: 1, points: rules.powerPlayGoal, note: null });
      } else {
        breakdown.push({ label: "Goal", count: 1, points: rules.goal, note: null });
      }
    }
  }
  if (assists > 0) {
    breakdown.push({
      label: "Assist",
      count: assists,
      points: assists * rules.assist,
      note: null,
    });
  }
  return breakdown;
}

export class PoolScoringService {
  private readonly store: NhlPoolScoringArchiveStore;
  private readonly fetchImpl: NhlJsonFetch;
  private readonly now: () => Date;
  private readonly loadRosters: typeof loadDraftRosters;
  private readonly loadRules: typeof loadPersistedScoringRules;
  private ingestInFlight: Promise<void> | null = null;

  constructor(options: PoolScoringServiceOptions = {}) {
    this.store = options.store ?? postgresNhlPoolScoringArchiveStore;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.loadRosters = options.loadRosters ?? loadDraftRosters;
    this.loadRules = options.loadRules ?? loadPersistedScoringRules;
  }

  async getArchivePlayerIdentities(): Promise<ArchivedLeaguePlayerIdentity[]> {
    const recordValue = await this.store.read();
    const archive = archiveFrom(recordValue?.snapshot);
    const latest = new Map<number, { identity: ArchivedLeaguePlayerIdentity; date: string; gameId: number }>();
    for (const game of Object.values(archive.gameFacts)) {
      for (const player of Object.values(game.players)) {
        const previous = latest.get(player.playerId);
        if (!previous || game.gameDate > previous.date ||
            (game.gameDate === previous.date && game.gameId > previous.gameId)) {
          latest.set(player.playerId, {
            identity: {
              nhlPlayerId: player.playerId,
              team: player.teamAbbrev,
              position: player.position,
            },
            date: game.gameDate,
            gameId: game.gameId,
          });
        }
      }
    }
    return [...latest.values()].map(value => value.identity);
  }

  /**
   * League-wide scoring projection for the available-player catalog. This
   * deliberately shares the persisted archive and current rules with pool
   * scoring; callers receive aggregate rows, never private archive internals.
   */
  async getLeaguePlayerScores(
    identities: readonly LeaguePlayerIdentity[],
  ): Promise<{
    status: PoolScoringStatus;
    reason: string | null;
    asOf: string | null;
    coverageThroughDate: string | null;
    rows: LeaguePlayerScore[];
  }> {
    let recordValue;
    try {
      recordValue = await this.store.read();
    } catch {
      return {
        status: "unavailable",
        reason: "The persisted NHL scoring archive could not be read.",
        asOf: null,
        coverageThroughDate: null,
        rows: identities.map(identity => ({
          nhlPlayerId: identity.nhlPlayerId,
          goals: null, assists: null, powerPlayGoals: null, shortHandedGoals: null,
          overtimeGoals: null, poolPoints: null, gamesPlayed: null, wins: null,
          shutouts: null, scoringStatus: "pending", reason: "Scoring archive unavailable.",
        })),
      };
    }
    let rules: ScoringRules | null = null;
    try {
      rules = (await this.loadRules()).rules;
    } catch {
      // Never substitute defaults when the current persisted rules are missing.
    }
    const archive = archiveFrom(recordValue?.snapshot);
    const { today, lastNight } = getPoolDates(this.now());
    const coverage = coverageThroughDate(archive, today);
    const historyComplete = hasCompletePriorCoverage(
      archive,
      today,
      lastNight,
    );
    const selectedArchive: PoolScoringArchive = {
      ...archive,
      gameFacts: Object.fromEntries(
        Object.entries(archive.gameFacts).filter(([, game]) => game.gameDate <= today),
      ),
    };
    const syntheticRosters: DraftRoster[] = identities.map((identity, index) => {
      const teamName = identity.team ? NHL_TEAM_NAMES[identity.team] ?? null : null;
      const isGoalie = identity.position === "G";
      return {
        id: `available-player-${identity.nhlPlayerId}`,
        name: `Available player ${identity.nhlPlayerId}`,
        selections: [{
          round: index + 1,
          originalText: `Available player ${identity.nhlPlayerId}`,
          assetType: isGoalie ? "goalieTeam" : "skater",
          position: isGoalie ? "G" : identity.position === "D" ? "D" : "F",
          reviewNote: null,
          nhlPlayerId: isGoalie ? null : identity.nhlPlayerId,
          confirmedTeam: teamName,
          ...(isGoalie ? {
            goalies: [{
              nhlPlayerId: identity.nhlPlayerId,
              confirmedName: `Available goalie ${identity.nhlPlayerId}`,
              confirmedTeam: teamName ?? "",
              identitySource: "Official NHL player catalog",
            }],
            goalieNamesPending: false,
          } : {}),
        }],
      };
    });
    const scoredRows = rowsForRosters(syntheticRosters, selectedArchive, rules, historyComplete);
    const rows = scoredRows.map(row => {
      const identity = identities.find(player => player.nhlPlayerId === row.nhlPlayerId);
      const hasKnownStats = [
        row.goals, row.assists, row.powerPlayGoals, row.shortHandedGoals,
        row.overtimeGoals, row.gamesPlayed, row.wins, row.shutouts,
      ].some(value => value !== null);
      const provisionalLive = identity !== undefined && Object.values(selectedArchive.gameFacts).some(game =>
        game.gameDate === today && game.verified && !game.final &&
        Boolean(game.players[String(identity.nhlPlayerId)]),
      );
      const relevantUnverifiedFacts = identity !== undefined &&
        Object.values(selectedArchive.gameFacts).some(game =>
          !game.verified &&
          (Boolean(game.players[String(identity.nhlPlayerId)]) ||
            identity.team === game.homeTeamAbbrev ||
            identity.team === game.awayTeamAbbrev),
        );
      const pendingGoalieResult =
        identity?.position === "G" &&
        historyComplete &&
        !relevantUnverifiedFacts &&
        (row.wins === null || row.shutouts === null);
      const complete = row.poolPoints !== null &&
        historyComplete &&
        !provisionalLive &&
        !pendingGoalieResult;
      const reason = !rules
        ? "Saved pool scoring rules are unavailable; points are pending."
        : provisionalLive
          ? LIVE_PROVISIONAL_REASON
          : relevantUnverifiedFacts
            ? "Relevant NHL game facts remain unverified; only verified scoring events contribute to the known subtotal."
          : pendingGoalieResult
            ? "Verified goalie points are a known subtotal; individual decision or shutout facts are pending."
          : row.poolPoints === null
            ? historyComplete
              ? "One or more relevant per-game scoring facts are incomplete."
              : COVERAGE_PENDING
            : !historyComplete
              ? COVERAGE_PENDING
              : null;
      return {
        nhlPlayerId: row.nhlPlayerId!,
        goals: row.goals,
        assists: row.assists,
        powerPlayGoals: row.powerPlayGoals,
        shortHandedGoals: row.shortHandedGoals,
        overtimeGoals: row.overtimeGoals,
        poolPoints: row.poolPoints,
        gamesPlayed: row.gamesPlayed,
        wins: row.wins,
        shutouts: row.shutouts,
        scoringStatus: complete ? "complete" as const
          : hasKnownStats ? "partial" as const : "pending" as const,
        reason,
      };
    });
    const hasUnverifiedGames = Object.values(selectedArchive.gameFacts).some(game => !game.verified);
    const hasVerifiedLiveGames = Object.values(selectedArchive.gameFacts).some(game =>
      game.verified && !game.final && game.gameDate === today,
    );
    const hasIncompletePlayerScores = rows.some(row => row.scoringStatus !== "complete");
    const status = !recordValue?.snapshot
      ? "unavailable"
      : recordValue.error && recordValue.lastSuccessAt
        ? "stale"
        : !historyComplete || !rules || !recordValue || recordValue.error ||
          archive.sourceIssue || hasUnverifiedGames || hasVerifiedLiveGames ||
          hasIncompletePlayerScores
          ? "partial"
          : "available";
    const statusReason = !rules
      ? "Saved pool scoring rules are unavailable."
      : !recordValue?.snapshot
        ? SOURCE_UNAVAILABLE
        : archive.sourceIssue ?? recordValue.error ??
          (!historyComplete ? COVERAGE_PENDING
            : hasUnverifiedGames ? SCHEDULED_GAME_PENDING
              : hasVerifiedLiveGames ? LIVE_PROVISIONAL_REASON
                : hasIncompletePlayerScores
                  ? "One or more player scores retain known subtotals while verified goalie decision or shutout facts remain pending."
                  : null);
    return {
      status,
      reason: statusReason,
      asOf: recordValue?.lastSuccessAt ?? null,
      coverageThroughDate: coverage,
      rows,
    };
  }

  async ingest(
    feeds: NhlSourceFeeds,
    rawPayloads: NhlRawPayloads,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.ingestInFlight) return this.ingestInFlight;
    const operation = this.ingestCycle(feeds, rawPayloads, signal);
    this.ingestInFlight = operation;
    try {
      await operation;
    } finally {
      if (this.ingestInFlight === operation) this.ingestInFlight = null;
    }
  }

  private async ingestCycle(
    feeds: NhlSourceFeeds,
    rawPayloads: NhlRawPayloads,
    signal?: AbortSignal,
  ): Promise<void> {
    let archive: PoolScoringArchive;
    try {
      const previous = await this.store.read();
      archive = archiveFrom(previous?.snapshot);
      archive.sourceIssue = null;
      const now = this.now();
      const checkedAt = now.toISOString();
      let refreshFailed = scoreFeedFacts(archive, feeds, rawPayloads, checkedAt);
      const { today } = getTorontoDates(now);
      try {
        if (await reconcileSeasonAudit(archive, today, this.fetchImpl, checkedAt, signal)) {
          refreshFailed = true;
        }
      } catch {
        archive.sourceIssue = "Official NHL season audit could not be completed.";
        refreshFailed = true;
      }
      try {
        if (await backfillRecentSchedule(archive, today, this.fetchImpl, checkedAt, signal)) {
          refreshFailed = true;
        }
      } catch {
        archive.sourceIssue = "Official NHL recent schedule could not be refreshed.";
        refreshFailed = true;
      }
      try {
        if (await backfillSchedule(archive, today, this.fetchImpl, signal)) {
          refreshFailed = true;
        }
      } catch {
        archive.sourceIssue = "Official NHL season schedule could not be refreshed.";
        refreshFailed = true;
      }
      try {
        if (await backfillGameFacts(archive, today, this.fetchImpl, checkedAt, signal)) {
          refreshFailed = true;
        }
      } catch {
        archive.sourceIssue = "Historical official NHL game facts could not be refreshed.";
        refreshFailed = true;
      }
      if (refreshFailed) {
        await this.store.progress(archive, ARCHIVE_FAILURE);
      } else {
        await this.store.succeed(archive);
      }
    } catch {
      try {
        await this.store.fail(ARCHIVE_FAILURE);
      } catch {
        // The persisted last-good cache remains the authority if both writes fail.
      }
    }
  }

  async getSnapshot(
    source: { status: string; lastSuccessAt: string | null },
    requestedDate?: string,
  ): Promise<PoolScoringSnapshot> {
    const currentDates = getPoolDates(this.now());
    const selectedDate = requestedDate && requestedDate < currentDates.today
      ? requestedDate
      : currentDates.today;
    let rosters: Awaited<ReturnType<typeof loadDraftRosters>>;
    try {
      if (this.loadRosters === loadDraftRosters) await resolvePendingPickups();
      rosters = await this.loadRosters();
    } catch {
      return {
        status: "unavailable",
        reason: "The saved owner and draft selection records could not be read.",
        asOf: null,
        season: NHL_SEASON,
        coverageThroughDate: null,
        rows: [],
      };
    }

    let archiveRecord;
    try {
      archiveRecord = await this.store.read();
    } catch {
      return {
        status: "unavailable",
        reason: "The persisted NHL scoring archive could not be read.",
        asOf: null,
        season: NHL_SEASON,
        coverageThroughDate: null,
        rows: rowsForRosters(rosters, emptyArchive(), null, false),
      };
    }
    const archive = archiveFrom(archiveRecord?.snapshot);
    const hasArchive = Boolean(archiveRecord?.snapshot);
    const coverageDate = coverageThroughDate(archive, selectedDate);
    const historyComplete = selectedDate < currentDates.today
      ? Boolean(
          (archive.regularSeasonStartDate && selectedDate < archive.regularSeasonStartDate) ||
          (coverageDate && coverageDate >= selectedDate),
        )
      : hasCompletePriorCoverage(archive, currentDates.today, currentDates.lastNight);
    const sourceFresh = source.status === "available";
    let rules: ScoringRules | null = null;
    try {
      rules = (await this.loadRules()).rules;
    } catch {
      // The rules store error is reflected in status/reason; defaults are not used.
    }
    const selectedArchive = {
      ...archive,
      gameFacts: Object.fromEntries(
        Object.entries(archive.gameFacts).filter(([, game]) => game.gameDate <= selectedDate),
      ),
    };
    const currentUnverifiedGames = Object.values(selectedArchive.gameFacts).filter(game =>
      !game.verified,
    );
    const verifiedLiveGames = Object.values(selectedArchive.gameFacts).filter(game =>
      game.verified && !game.final && selectedDate === currentDates.today,
    );
    const rows = rowsForRosters(rosters, selectedArchive, rules, historyComplete, selectedDate);
    const rowsPending = rows.filter(row => row.poolPoints === null);
    const futureRequested = Boolean(requestedDate && requestedDate > currentDates.today);
    const liveProvisionalOnly =
      verifiedLiveGames.length > 0 &&
      sourceFresh &&
      historyComplete &&
      currentUnverifiedGames.length === 0 &&
      rowsPending.length === 0 &&
      rules !== null &&
      archive.sourceIssue === null &&
      !futureRequested &&
      !archiveRecord?.error;
    const gameReasons = Object.values(selectedArchive.gameFacts)
      .filter(game => !game.verified)
      .map(game => `Game ${game.gameId}: ${game.reason ?? "official NHL data is incomplete."}`);
    const goalieFactReasons = pendingGoalieFactReasons(selectedArchive);
    const reasons = uniqueReasons([
      !hasArchive ? SOURCE_UNAVAILABLE : null,
      !historyComplete ? COVERAGE_PENDING : null,
      currentUnverifiedGames.length ? SCHEDULED_GAME_PENDING : null,
      liveProvisionalOnly ? LIVE_PROVISIONAL_REASON : null,
      futureRequested
        ? "Future pool dates are excluded; totals stop at the current Toronto pool day, which ends at 2:00 a.m."
        : null,
      archive.sourceIssue,
      rules === null ? "Saved current pool scoring rules could not be loaded." : null,
      ...pendingGoalieNameReasons(rosters),
      ...goalieFactReasons,
      ...(historyComplete ? unresolvedRowReasons(rosters, selectedArchive, rules) : []),
      ...gameReasons,
    ]);

    let status: PoolScoringStatus;
    if (!hasArchive) status = "unavailable";
    else if (!sourceFresh && archiveRecord?.lastSuccessAt) status = "stale";
    else if (
      !sourceFresh ||
      !historyComplete ||
      currentUnverifiedGames.length ||
      rowsPending.length > 0 ||
      goalieFactReasons.length > 0 ||
      rules === null ||
      archive.sourceIssue !== null ||
      futureRequested ||
      verifiedLiveGames.length > 0
    ) {
      status = "partial";
    } else status = "available";

    if (archiveRecord?.error && !reasons.includes(archiveRecord.error)) {
      reasons.push(archiveRecord.error);
      status = archiveRecord.lastSuccessAt ? "stale" : "unavailable";
    }
    return {
      status,
      reason: reasons.length ? reasons.join(" ") : null,
      asOf: archiveRecord?.lastSuccessAt ?? null,
      season: NHL_SEASON,
      coverageThroughDate: coverageDate,
      rows,
    };
  }

  async getDailySnapshot(
    date: string,
    source: { status: string; lastSuccessAt: string | null },
  ): Promise<DailyPoolScoringSnapshot> {
    const currentDates = getPoolDates(this.now());
    const unavailable = (summary: string): DailyPoolScoringSnapshot => ({
      date,
      status: "unavailable",
      verifiedFinalCoverage: false,
      summary,
      scoring: [],
      owners: [],
    });
    if (date > currentDates.today) {
      return {
        date,
        status: "pending",
        verifiedFinalCoverage: false,
        summary: "Future Toronto pool dates are excluded; the current pool day continues until 2:00 a.m.",
        scoring: [],
        owners: [],
      };
    }

    let rosters: Awaited<ReturnType<typeof loadDraftRosters>>;
    let archiveRecord;
    try {
      [rosters, archiveRecord] = await Promise.all([
        this.loadRosters(),
        this.store.read(),
      ]);
    } catch {
      return unavailable("Official NHL scoring archive or saved pool selections are unavailable.");
    }
    if (!archiveRecord?.snapshot) {
      return unavailable(SOURCE_UNAVAILABLE);
    }
    const archive = archiveFrom(archiveRecord.snapshot);
    let rules: ScoringRules | null = null;
    try {
      rules = (await this.loadRules()).rules;
    } catch {
      // Never substitute function defaults for the saved pool configuration.
    }
    const beforeSeason = Boolean(archive.regularSeasonStartDate && date < archive.regularSeasonStartDate);
    const scheduledIds = archive.scheduleDates[date];
    const allDayGames = Object.values(archive.gameFacts).filter(game => game.gameDate === date);
    // Only validated event facts can produce daily points, even provisionally.
    const dayGames = allDayGames.filter(game => game.verified);
    const scheduleCovered = beforeSeason || scheduledIds !== undefined;
    const allDayGamesVerified = beforeSeason || Boolean(
      scheduledIds &&
      scheduledIds.every(id => {
        const game = archive.gameFacts[String(id)];
        return Boolean(game?.verified && game.final);
      }),
    );
    const dayPendingGame = allDayGames.some(game => !game.final || !game.verified);
    const seasonCoverage = coverageThroughDate(archive, date);
    const seasonComplete = beforeSeason || Boolean(seasonCoverage && seasonCoverage >= date);
    const isCurrentDate = date === currentDates.today;
    const cutoffArchive = {
      ...archive,
      gameFacts: Object.fromEntries(
        Object.entries(archive.gameFacts).filter(([, game]) => game.gameDate <= date),
      ),
    };
    const seasonRows = rowsForRosters(rosters, cutoffArchive, rules, seasonComplete, date);
    const seasonScoringComplete = rules !== null &&
      seasonRows.every(row => row.poolPoints !== null);
    const reasons = uniqueReasons([
      !rules ? "Saved current pool scoring rules could not be loaded." : null,
      !scheduleCovered ? "Official schedule coverage for this Toronto date is pending." : null,
      scheduleCovered && !allDayGamesVerified ? "One or more games for this date are live or not fully verified." : null,
      !seasonComplete ? COVERAGE_PENDING : null,
      !seasonScoringComplete
        ? "One or more season pool totals remain pending because identity, game facts, or scoring policy is unresolved."
        : null,
      ...pendingGoalieNameReasons(rosters),
      ...pendingGoalieFactReasons(cutoffArchive),
      ...(seasonComplete ? unresolvedRowReasons(rosters, cutoffArchive, rules) : []),
      archiveRecord.error
        ? "The NHL scoring archive refresh failed; only last-good facts are retained."
        : null,
      isCurrentDate && source.status !== "available"
        ? "The current NHL source is stale or unavailable; only archived last-good facts are shown."
        : null,
      archive.sourceIssue,
      ...allDayGames.filter(game => !game.verified).map(game =>
        `Game ${game.gameId}: ${game.reason ?? "official NHL data is incomplete."}`,
      ),
    ]);

    const dayRows: DailyPoolScoringSnapshot["scoring"] = [];
    const ownerDailyPoints = new Map<string, number>();
    const ownerScoringRows = new Map<string, DailyPoolScoringSnapshot["scoring"]>();
    for (const owner of rosters) {
      const ownerRows: DailyPoolScoringSnapshot["scoring"] = [];
      for (const selection of owner.selections) {
        if (selection.assetType === "skater") {
          const playerId = selection.nhlPlayerId;
          if (!playerId) continue;
          if (selection.acquiredAt && date < ownershipPoolDate(selection.acquiredAt)) continue;
          if (selection.droppedAt && date >= ownershipPoolDate(selection.droppedAt)) {
            const frozen = selection.frozenDailyScoring?.[date];
            if (frozen && frozen.poolPoints !== null && frozen.poolPoints > 0) {
              ownerRows.push({ ownerId: owner.id, ownerName: owner.name,
                playerId: String(playerId), playerName: selection.confirmedName ?? selection.originalText,
                team: selection.confirmedTeam ?? "", goals: frozen.goals ?? 0,
                assists: frozen.assists ?? 0, powerPlayGoals: frozen.powerPlayGoals ?? 0,
                shortHandedGoals: frozen.shortHandedGoals ?? 0, overtimeGoals: frozen.overtimeGoals ?? 0,
                poolPoints: frozen.poolPoints, hatTrick: false,
                scoringBreakdown: [{ label: "Points earned before drop", count: 1, points: frozen.poolPoints, note: null }] });
            }
            continue;
          }
          let goals = 0;
          let assists = 0;
          let ppg = 0;
          let shg = 0;
          let otg = 0;
          let hatTrick = false;
          let points = 0;
          let pending = !rules;
          const breakdown: DailyPoolScoringSnapshot["scoring"][number]["scoringBreakdown"] = [];
          let team = selection.confirmedTeam ?? "";
          for (const game of dayGames) {
            if (selection.scoringExcludedGameIds?.includes(game.gameId)) continue;
            const eligible = ownershipGameEligibility(selection, game.gameId, game.gameDate,
              archive.scheduledGames[String(game.gameId)]?.startTimeUTC);
            if (eligible === false) continue;
            if (eligible === null) { pending = true; continue; }
            const player = game.players[String(playerId)];
            if (!player || player.position === "G") continue;
            team = player.teamAbbrev;
            goals += player.goals.length;
            assists += player.assists;
            ppg += player.goals.filter(goal => goal.powerPlay).length;
            shg += player.goals.filter(goal => goal.shortHanded).length;
            otg += player.goals.filter(goal => goal.overtime).length;
            if (!rules || (player.position !== "F" && player.position !== "D")) {
              pending = true;
              continue;
            }
            const scored = scoreSkaterGame(player.position, player.goals, player.assists, rules);
            if (scored.poolPoints === null) {
              pending = true;
              reasons.push(`Owner ${owner.id}, round ${selection.round}, game ${game.gameId}: ${scored.pendingReason}`);
              continue;
            }
            points += scored.poolPoints;
            hatTrick ||= scored.hatTrick;
            breakdown.push(...goalScoringBreakdown(
              player.position,
              player.goals,
              player.assists,
              rules,
              scored,
            ));
          }
          const earned = subtractOwnershipBaseline({
            goals, assists, powerPlayGoals: ppg, shortHandedGoals: shg, overtimeGoals: otg,
            poolPoints: points, gamesPlayed: 0, wins: null, shutouts: null,
          }, selection.ownershipDailyBaselines?.[date]);
          goals = earned.goals ?? 0; assists = earned.assists ?? 0;
          ppg = earned.powerPlayGoals ?? 0; shg = earned.shortHandedGoals ?? 0;
          otg = earned.overtimeGoals ?? 0; points = earned.poolPoints ?? 0;
          if (selection.ownershipDailyBaselines?.[date]) {
            breakdown.splice(0, breakdown.length,
              { label: "Points earned after pickup", count: 1, points, note: null });
          }
          if (pending || (goals === 0 && assists === 0)) continue;
          ownerRows.push({
            ownerId: owner.id,
            ownerName: owner.name,
            playerId: String(playerId),
            playerName: selection.confirmedName ?? `NHL player ${playerId}`,
            team,
            goals,
            assists,
            powerPlayGoals: ppg,
            shortHandedGoals: shg,
            overtimeGoals: otg,
            hatTrick,
            poolPoints: points,
            scoringBreakdown: breakdown,
          });
          continue;
        }

        if (!rules || selection.goalieNamesPending) continue;
        for (const goalie of selection.goalies ?? []) {
          if (selection.acquiredAt && date < ownershipPoolDate(selection.acquiredAt)) continue;
          if (selection.droppedAt && date >= ownershipPoolDate(selection.droppedAt)) {
            const frozen = selection.frozenDailyGoalieScoring?.[date]?.[String(goalie.nhlPlayerId)];
            if (frozen && frozen.poolPoints !== null && frozen.poolPoints > 0)
              ownerRows.push({ ownerId: owner.id, ownerName: owner.name, playerId: String(goalie.nhlPlayerId),
                playerName: goalie.confirmedName, team: goalie.confirmedTeam, goals: frozen.goals ?? 0,
                assists: frozen.assists ?? 0, powerPlayGoals: 0, shortHandedGoals: 0, overtimeGoals: 0,
                poolPoints: frozen.poolPoints, hatTrick: false,
                scoringBreakdown: [{ label: "Points retained before administrator removal", count: 1, points: frozen.poolPoints, note: null }] });
            continue;
          }
          const abbreviation = teamAbbreviation(goalie.confirmedTeam);
          if (!abbreviation) continue;
          let goals = 0;
          let assists = 0;
          let points = 0;
          let pendingResult = false;
          const breakdown: DailyPoolScoringSnapshot["scoring"][number]["scoringBreakdown"] = [];
          for (const game of dayGames) {
            const eligible = ownershipGameEligibility(selection, game.gameId, game.gameDate, archive.scheduledGames?.[String(game.gameId)]?.startTimeUTC);
            if (eligible === false) continue;
            if (eligible === null) { pendingResult = true; continue; }
            const player = game.players[String(goalie.nhlPlayerId)];
            if (!player || player.position !== "G") continue;
            const gameGoals = player.goals.length;
            const gameAssists = player.assists;
            goals += gameGoals;
            assists += gameAssists;
            if (gameGoals > 0) {
              points += gameGoals * rules.goalieGoal;
              breakdown.push({
                label: "Goalie goal",
                count: gameGoals,
                points: gameGoals * rules.goalieGoal,
                note: null,
              });
            }
            if (gameAssists > 0) {
              points += gameAssists * rules.goalieAssist;
              breakdown.push({
                label: "Goalie assist",
                count: gameAssists,
                points: gameAssists * rules.goalieAssist,
                note: null,
              });
            }
            if (player.goalieAppeared === false) continue;
            if (!game.final) {
              pendingResult = true;
            } else if (game.goalieResultsComplete !== true) {
              pendingResult = true;
            } else if (player.goalieDecision === "W") {
              if (player.goalieShutoutWin === true) {
                points += rules.goalieTeamShutoutWin;
                breakdown.push({
                  label: "Goalie shutout win",
                  count: 1,
                  points: rules.goalieTeamShutoutWin,
                  note: null,
                });
              } else if (player.goalieShutoutWin === false) {
                points += rules.goalieTeamWin;
                breakdown.push({
                  label: "Goalie win",
                  count: 1,
                  points: rules.goalieTeamWin,
                  note: null,
                });
              } else {
                pendingResult = true;
              }
            } else if (
              player.goalieDecision !== "L" &&
              player.goalieDecision !== "O" &&
              !(player.goalieDecision === null && player.goalieAppeared === true)
            ) {
              pendingResult = true;
            }
          }
          if (pendingResult) {
            reasons.push(
              `Owner ${owner.id}, round ${selection.round}, ${goalie.confirmedName}: individual goalie decision or shutout facts are pending; team results are not credited.`,
            );
            if (points === 0) continue;
          }
          if (points === 0) continue;
          ownerRows.push({
            ownerId: owner.id,
            ownerName: owner.name,
            playerId: String(goalie.nhlPlayerId),
            playerName: goalie.confirmedName,
            team: abbreviation,
            goals,
            assists,
            powerPlayGoals: 0,
            shortHandedGoals: 0,
            overtimeGoals: 0,
            hatTrick: false,
            poolPoints: points,
            scoringBreakdown: breakdown,
          });
        }
      }
      ownerRows.sort((a, b) => b.poolPoints - a.poolPoints || a.playerName.localeCompare(b.playerName));
      ownerScoringRows.set(owner.id, ownerRows);
      ownerDailyPoints.set(owner.id, ownerRows.reduce((sum, row) => sum + row.poolPoints, 0));
      dayRows.push(...ownerRows);
    }
    dayRows.sort((a, b) =>
      b.poolPoints - a.poolPoints ||
      a.playerName.localeCompare(b.playerName) ||
      a.ownerName.localeCompare(b.ownerName) ||
      a.ownerId.localeCompare(b.ownerId),
    );

    const verifiedFinalCoverage =
      scheduleCovered &&
      allDayGamesVerified &&
      seasonComplete &&
      !dayPendingGame &&
      seasonScoringComplete &&
      rules !== null;
    const snapshotStatus: DailyPoolScoringSnapshot["status"] =
      !archiveRecord.snapshot
        ? "unavailable"
        : verifiedFinalCoverage &&
            !archiveRecord.error &&
            (!isCurrentDate || source.status === "available")
          ? "final"
          : "pending";
    let owners: DailyPoolScoringSnapshot["owners"] = [];
    if (verifiedFinalCoverage) {
      const yesterday = addDays(date, -1);
      const previousArchive = {
        ...archive,
        gameFacts: Object.fromEntries(
          Object.entries(archive.gameFacts).filter(([, game]) => game.gameDate <= yesterday),
        ),
      };
      const priorRows = rowsForRosters(rosters, previousArchive, rules, true, yesterday);
      const totals = new Map<string, number>();
      const previousTotals = new Map<string, number>();
      for (const row of seasonRows) {
        if (row.poolPoints !== null) totals.set(row.ownerId, (totals.get(row.ownerId) ?? 0) + row.poolPoints);
      }
      for (const row of priorRows) {
        if (row.poolPoints !== null) previousTotals.set(row.ownerId, (previousTotals.get(row.ownerId) ?? 0) + row.poolPoints);
      }
      const currentRank = ownerRanks(totals);
      const previousRank = ownerRanks(previousTotals);
      owners = rosters.map(owner => {
        const ownerRows = ownerScoringRows.get(owner.id) ?? [];
        const dailyPoints = ownerDailyPoints.get(owner.id) ?? 0;
        const seasonPoints = totals.get(owner.id) ?? 0;
        return {
          ownerId: owner.id,
          ownerName: owner.name,
          dailyPoints,
          seasonPoints,
          rank: currentRank.get(owner.id) ?? rosters.length,
          previousRank: previousRank.get(owner.id) ?? null,
          narrative: dailyPoints > 0
            ? `${owner.name} scored ${dailyPoints} pool points on ${date}.`
            : `${owner.name} had no verified scoring events on ${date}.`,
          scoring: ownerRows,
        };
      }).sort((a, b) => a.rank - b.rank);
    }
    const status = !archiveRecord.snapshot
      ? "unavailable"
      : snapshotStatus;
    const reason = reasons.length ? reasons.join(" ") : null;
    return {
      date,
      status,
      verifiedFinalCoverage,
      summary: status === "final"
        ? dayRows.length
          ? `Official NHL regular-season scoring for ${date} is verified.`
          : `Official NHL regular-season coverage confirms no pool scoring events on ${date}.`
        : reason ?? "Official NHL scoring for this date is still pending.",
      scoring: dayRows,
      owners,
    };
  }
}

export const poolScoringService = new PoolScoringService();