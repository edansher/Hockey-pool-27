import assert from "node:assert/strict";
import test from "node:test";
import {
  getTorontoDates,
  parseNhlScoreFeed,
  validateNhlGamePayload,
  type NhlSourceGame,
} from "./nhl-source-parser";

function sourceGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 2026020009,
    season: 20262027,
    gameType: 2,
    gameDate: "2026-10-01",
    gameState: "FUT",
    startTimeUTC: "2026-10-01T23:00:00Z",
    awayTeam: {
      name: { default: "Flyers" },
      abbrev: "PHI",
    },
    homeTeam: {
      name: { default: "Devils" },
      abbrev: "NJD",
    },
    ...overrides,
  };
}

function scoreFeed(date: string, games: unknown[]) {
  return { currentDate: date, games };
}

test("strictly validates score-feed currentDate, games shape, and each game date", () => {
  assert.throws(() => parseNhlScoreFeed({}, "2026-10-01"));
  assert.throws(
    () => parseNhlScoreFeed(scoreFeed("2026-09-30", []), "2026-10-01"),
    /date or games/,
  );
  assert.throws(
    () => parseNhlScoreFeed({ currentDate: "2026-10-01", games: {} }, "2026-10-01"),
    /date or games/,
  );
  assert.throws(
    () =>
      parseNhlScoreFeed(
        scoreFeed("2026-10-01", [sourceGame({ gameDate: "2026-10-02" })]),
        "2026-10-01",
      ),
    /game date/,
  );
  assert.throws(() => parseNhlScoreFeed(scoreFeed("2026-02-30", []), "2026-02-30"));
});

test("preserves actual zero scores while missing score values remain unknown", () => {
  const feed = parseNhlScoreFeed(
    scoreFeed("2026-10-01", [
      sourceGame({ awayTeam: { name: { default: "Flyers" }, abbrev: "PHI", score: 0 } }),
    ]),
    "2026-10-01",
  );
  assert.equal(feed.games[0]?.awayScore, 0);
  assert.equal(feed.games[0]?.homeScore, null);
  assert.equal(feed.games[0]?.gameState, "FUT");
  assert.equal(feed.games[0]?.awayName, "Flyers");
  assert.equal(feed.games[0]?.startTimeUTC, "2026-10-01T23:00:00Z");
});

test("only 2026-27 regular-season games are pool eligible", () => {
  const feed = parseNhlScoreFeed(
    scoreFeed("2026-10-01", [
      sourceGame(),
      sourceGame({ id: 2026010001, gameType: 1 }),
      sourceGame({ id: 2025020001, season: 20252026 }),
    ]),
    "2026-10-01",
  );
  assert.deepEqual(
    feed.games.map(({ poolEligible }) => poolEligible),
    [true, false, false],
  );
});

test("validates boxscore and play-by-play identity against the parent game", () => {
  const game: NhlSourceGame = parseNhlScoreFeed(
    scoreFeed("2026-10-01", [sourceGame()]),
    "2026-10-01",
  ).games[0]!;
  const payload = {
    id: game.id,
    season: game.season,
    gameType: game.gameType,
    gameDate: game.gameDate,
    plays: [],
  };
  assert.equal(validateNhlGamePayload(payload, game).id, game.id);
  for (const mismatch of [
    { ...payload, id: game.id + 1 },
    { ...payload, season: game.season - 1 },
    { ...payload, gameType: 1 },
    { ...payload, gameDate: "2026-10-02" },
  ]) {
    assert.throws(() => validateNhlGamePayload(mismatch, game), /does not match/);
  }
});

test("Toronto dates follow local midnight across UTC offsets and daylight-saving transitions", () => {
  assert.deepEqual(getTorontoDates(new Date("2026-10-01T03:59:00Z")), {
    today: "2026-09-30",
    lastNight: "2026-09-29",
  });
  assert.deepEqual(getTorontoDates(new Date("2026-10-01T04:00:00Z")), {
    today: "2026-10-01",
    lastNight: "2026-09-30",
  });
  assert.deepEqual(getTorontoDates(new Date("2026-11-01T03:59:00Z")), {
    today: "2026-10-31",
    lastNight: "2026-10-30",
  });
  assert.deepEqual(getTorontoDates(new Date("2026-11-01T05:00:00Z")), {
    today: "2026-11-01",
    lastNight: "2026-10-31",
  });
});