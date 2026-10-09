import { isCalendarDate } from "./calendar-date";

export const NHL_PROVIDER = "NHL.com";
export const NHL_SOURCE_URL = "https://www.nhl.com/scores";
export const NHL_SEASON = 20262027;
export const NHL_REFRESH_INTERVAL_SECONDS = 300;

export interface NhlSourceGame {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  gameState: string;
  startTimeUTC: string | null;
  awayAbbrev: string;
  awayName: string;
  awayScore: number | null;
  homeAbbrev: string;
  homeName: string;
  homeScore: number | null;
  poolEligible: boolean;
}

export interface NhlDayFeed {
  date: string;
  games: NhlSourceGame[];
}

export interface NhlSourceFeeds {
  today: NhlDayFeed;
  lastNight: NhlDayFeed;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid NHL ${label}`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid NHL ${label}`);
  }
  return value;
}

function nullableScore(team: UnknownRecord, label: string): number | null {
  if (!Object.hasOwn(team, "score") || team.score === null) return null;
  return requiredInteger(team.score, `${label} score`);
}

function requiredTeam(value: unknown, label: "away" | "home") {
  if (!record(value)) throw new Error(`Invalid NHL ${label} team`);
  const name = value.name;
  if (!record(name)) throw new Error(`Invalid NHL ${label} team name`);

  return {
    abbrev: requiredString(value.abbrev, `${label} abbreviation`),
    name: requiredString(name.default, `${label} team name`),
    score: nullableScore(value, label),
  };
}

function nullableIsoDateTime(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error("Invalid NHL start time");
  }
  return value;
}

export function parseNhlScoreFeed(value: unknown, requestedDate: string): NhlDayFeed {
  if (!isCalendarDate(requestedDate) || !record(value)) {
    throw new Error("Invalid NHL score feed");
  }
  if (value.currentDate !== requestedDate || !Array.isArray(value.games)) {
    throw new Error("NHL score feed date or games are invalid");
  }

  const games = value.games.map((entry): NhlSourceGame => {
    if (!record(entry)) throw new Error("Invalid NHL game");
    const gameDate = entry.gameDate;
    if (!isCalendarDate(gameDate) || gameDate !== requestedDate) {
      throw new Error("NHL game date does not match requested date");
    }
    const away = requiredTeam(entry.awayTeam, "away");
    const home = requiredTeam(entry.homeTeam, "home");
    const season = requiredInteger(entry.season, "season");
    const gameType = requiredInteger(entry.gameType, "game type");

    return {
      id: requiredInteger(entry.id ?? entry.gameId, "game ID"),
      season,
      gameType,
      gameDate,
      gameState: requiredString(entry.gameState, "game state"),
      startTimeUTC: nullableIsoDateTime(entry.startTimeUTC),
      awayAbbrev: away.abbrev,
      awayName: away.name,
      awayScore: away.score,
      homeAbbrev: home.abbrev,
      homeName: home.name,
      homeScore: home.score,
      poolEligible: season === NHL_SEASON && gameType === 2,
    };
  });

  return { date: requestedDate, games };
}

export function validateNhlGamePayload(
  value: unknown,
  expected: Pick<NhlSourceGame, "id" | "season" | "gameType" | "gameDate">,
): UnknownRecord {
  if (!record(value)) throw new Error("Invalid NHL game payload");

  const idValue = value.id ?? value.gameId;
  const id = requiredInteger(idValue, "payload game ID");
  const season = requiredInteger(value.season, "payload season");
  const gameType = requiredInteger(value.gameType, "payload game type");
  const gameDate = value.gameDate;

  if (
    id !== expected.id ||
    season !== expected.season ||
    gameType !== expected.gameType ||
    gameDate !== expected.gameDate
  ) {
    throw new Error("NHL game payload does not match its score feed game");
  }
  return value;
}

export function getTorontoDates(now: Date): { today: string; lastNight: string } {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid current time");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const dateParts = new Map(parts.map(({ type, value }) => [type, value]));
  const today = `${dateParts.get("year")}-${dateParts.get("month")}-${dateParts.get("day")}`;
  if (!isCalendarDate(today)) throw new Error("Unable to determine Toronto calendar date");

  const previousDate = new Date(`${today}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return { today, lastNight: previousDate.toISOString().slice(0, 10) };
}