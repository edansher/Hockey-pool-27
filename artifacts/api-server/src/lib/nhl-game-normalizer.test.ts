import assert from "node:assert/strict";
import test from "node:test";
import { scoreSkaterGame } from "./pool-scoring";
import {
  goalieTeamResult,
  normalizeNhlGame,
  replacePerGameFact,
} from "./nhl-game-normalizer";

function payloads(options: {
  awayScore?: number;
  homeScore?: number;
  lastPeriodType?: string;
  plays?: unknown[];
  awayPlayer?: Record<string, unknown>;
  awayGoalie?: Record<string, unknown>;
  homeGoalie?: Record<string, unknown>;
  awayGoalies?: Array<Record<string, unknown>>;
} = {}) {
  const awayScore = options.awayScore ?? 5;
  const homeScore = options.homeScore ?? 0;
  const addOtherGoals = awayScore === 5;
  const awayPlayer = {
    playerId: 101,
    goals: 3,
    assists: 2,
    powerPlayGoals: 1,
    ...options.awayPlayer,
  };
  const boxscore = {
    id: 2026020001,
    season: 20262027,
    gameType: 2,
    gameDate: "2026-09-29",
    gameState: "OFF",
    awayTeam: { id: 1, abbrev: "EDM", score: awayScore },
    homeTeam: { id: 2, abbrev: "VAN", score: homeScore },
    playerByGameStats: {
      awayTeam: {
        forwards: [
          awayPlayer,
          { playerId: 104, goals: addOtherGoals ? 1 : 0, assists: 0, powerPlayGoals: 0 },
          { playerId: 105, goals: addOtherGoals ? 1 : 0, assists: 0, powerPlayGoals: 0 },
        ],
        defense: [],
        goalies: options.awayGoalies ?? [{ ...options.awayGoalie, playerId: 199 }],
      },
      homeTeam: {
        forwards: [],
        defense: [],
        goalies: [{ ...options.homeGoalie, playerId: 299 }],
      },
    },
    gameOutcome: { lastPeriodType: options.lastPeriodType ?? "OT" },
  };
  const plays = options.plays ?? [
    goal(101, 1, "1551", "REG"),
    goal(101, 1, "1541", "REG"),
    goal(101, 1, "1331", "OT"),
    goal(104, 1, "1551", "REG", 101),
    goal(105, 1, "1551", "REG", 101),
  ];
  const playByPlay = {
    id: 2026020001,
    season: 20262027,
    gameType: 2,
    gameDate: "2026-09-29",
    plays,
  };
  return { boxscore, playByPlay };
}

function goal(
  scoringPlayerId: number,
  eventOwnerTeamId: number,
  situationCode: string,
  periodType: string,
  assist1PlayerId?: number,
) {
  return {
    typeDescKey: "goal",
    situationCode,
    periodDescriptor: { number: periodType === "OT" ? 4 : 1, periodType },
    details: {
      scoringPlayerId,
      eventOwnerTeamId,
      ...(assist1PlayerId ? { assist1PlayerId } : {}),
    },
  };
}

const expected = {
  id: 2026020001,
  season: 20262027,
  gameType: 2,
  gameDate: "2026-09-29",
  gameState: "OFF",
  awayAbbrev: "EDM",
  homeAbbrev: "VAN",
};

test("normalizes official goal events, validates boxscore totals, and marks overtime/PP flags", () => {
  const { boxscore, playByPlay } = payloads();
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.equal(game.final, true);
  assert.deepEqual(game.players["101"]?.goals, [
    { powerPlay: false, shortHanded: false, overtime: false },
    { powerPlay: true, shortHanded: false, overtime: false },
    { powerPlay: false, shortHanded: false, overtime: true },
  ]);
  assert.equal(game.players["101"]?.assists, 2);
});

test("does not infer a 6v5 extra-attacker goal is a power-play or short-handed goal", () => {
  const play = goal(101, 1, "0651", "REG");
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "REG",
    awayPlayer: { goals: 1, assists: 0, powerPlayGoals: 0 },
    plays: [play],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.deepEqual(game.players["101"]?.goals, [
    { powerPlay: false, shortHanded: false, overtime: false },
  ]);
});

test("normalizes a short-handed empty-net goal from corroborating official SHG totals", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "REG",
    awayPlayer: {
      goals: 1,
      assists: 0,
      powerPlayGoals: 0,
      shorthandedGoals: 1,
    },
    plays: [goal(101, 1, "0551", "REG")],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.deepEqual(game.players["101"]?.goals, [
    { powerPlay: false, shortHanded: true, overtime: false },
  ]);
  assert.equal(
    scoreSkaterGame("F", game.players["101"]!.goals, 0).poolPoints,
    5,
  );
});

test("does not assume an ambiguous empty-net goal is even strength without SHG evidence", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "REG",
    awayPlayer: { goals: 1, assists: 0, powerPlayGoals: 0 },
    plays: [goal(101, 1, "0551", "REG")],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, false);
  assert.match(game.reason ?? "", /cannot be uniquely corroborated/);
});

test("normalizes a 6v5 empty-net extra attacker as even strength", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "REG",
    awayPlayer: { goals: 1, assists: 0, powerPlayGoals: 0 },
    plays: [goal(101, 1, "1560", "REG")],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.deepEqual(game.players["101"]?.goals, [
    { powerPlay: false, shortHanded: false, overtime: false },
  ]);
});

test("does not assign ambiguous PP flags by event order", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 2,
    homeScore: 0,
    lastPeriodType: "OT",
    awayPlayer: { goals: 2, assists: 0, powerPlayGoals: 1 },
    plays: [
      goal(101, 1, "0551", "REG"),
      goal(101, 1, "0551", "OT"),
    ],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, false);
  assert.match(game.reason ?? "", /cannot be uniquely corroborated/);
  assert.deepEqual(game.players["101"]?.goals, [
    { powerPlay: false, shortHanded: false, overtime: false },
    { powerPlay: false, shortHanded: false, overtime: true },
  ]);
});

test("shootout deciding goal is excluded while the winning goalie-team still has a shutout", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "SO",
    awayPlayer: { goals: 0, assists: 0, powerPlayGoals: 0 },
    plays: [goal(101, 1, "1551", "SO")],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.equal(game.players["101"]?.goals.length, 0);
  assert.deepEqual(goalieTeamResult(game, "EDM"), { win: true, shutoutWin: true });
  assert.deepEqual(goalieTeamResult(game, "VAN"), { win: false, shutoutWin: false });
});

test("official goalie decisions distinguish the winner and verify an individual shutout", () => {
  const { boxscore, playByPlay } = payloads({
    awayGoalie: { decision: "W", toi: "60:00" },
    homeGoalie: { decision: "L", toi: "60:00" },
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.equal(game.goalieResultsComplete, true);
  assert.equal(game.players["199"]?.goalieDecision, "W");
  assert.equal(game.players["199"]?.goalieAppeared, true);
  assert.equal(game.players["199"]?.goalieShutoutWin, true);
  assert.equal(game.players["299"]?.goalieDecision, "L");
  assert.equal(game.players["299"]?.goalieShutoutWin, false);
});

test("a pulled starter without a decision is verified when the relief goalie has the official win", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    awayPlayer: { goals: 1, assists: 0, powerPlayGoals: 0 },
    plays: [goal(101, 1, "1551", "REG")],
    awayGoalies: [
      { playerId: 199, toi: "30:00" },
      { playerId: 198, decision: "W", toi: "30:00" },
    ],
    homeGoalie: { decision: "L", toi: "60:00" },
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, true);
  assert.equal(game.goalieResultsComplete, true);
  assert.equal(game.players["199"]?.goalieAppeared, true);
  assert.equal(game.players["199"]?.goalieDecision, null);
  assert.equal(game.players["198"]?.goalieDecision, "W");
  assert.equal(game.players["198"]?.goalieShutoutWin, false);
});

test("a shared team shutout is not an individual goalie shutout", () => {
  const { boxscore, playByPlay } = payloads({
    awayGoalies: [
      { playerId: 199, decision: "W", toi: "30:00" },
      { playerId: 198, decision: "O", toi: "30:00" },
    ],
    homeGoalie: { decision: "L", toi: "60:00" },
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.goalieResultsComplete, true);
  assert.equal(game.players["199"]?.goalieDecision, "W");
  assert.equal(game.players["199"]?.goalieShutoutWin, false);
});

test("boxscore/play-by-play disagreement makes the game explicitly unverified", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 2,
    homeScore: 0,
    awayPlayer: { goals: 2, assists: 0, powerPlayGoals: 0 },
    plays: [goal(101, 1, "1551", "REG")],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, false);
  assert.match(game.reason ?? "", /disagree/);
});

test("a goalie G/A conflict with play-by-play makes the game explicitly unverified", () => {
  const { boxscore, playByPlay } = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "REG",
    awayPlayer: { goals: 1, assists: 0, powerPlayGoals: 0 },
    awayGoalie: { goals: 1, assists: 1 },
    plays: [goal(101, 1, "1551", "REG")],
  });
  const game = normalizeNhlGame(expected, boxscore, playByPlay);
  assert.equal(game.verified, false);
  assert.match(game.reason ?? "", /player 199/);
});

test("a corrected upstream game replaces the persisted per-game fact instead of double counting", () => {
  const originalPayloads = payloads();
  const correctedPayloads = payloads({
    awayScore: 1,
    homeScore: 0,
    lastPeriodType: "REG",
    awayPlayer: { goals: 1, assists: 0, powerPlayGoals: 0 },
    plays: [goal(101, 1, "1551", "REG")],
  });
  const facts: Record<string, ReturnType<typeof normalizeNhlGame>> = {};
  replacePerGameFact(
    facts,
    normalizeNhlGame(expected, originalPayloads.boxscore, originalPayloads.playByPlay),
  );
  replacePerGameFact(
    facts,
    normalizeNhlGame(expected, correctedPayloads.boxscore, correctedPayloads.playByPlay),
  );
  assert.equal(Object.keys(facts).length, 1);
  assert.equal(facts["2026020001"]?.players["101"]?.goals.length, 1);
  assert.equal(facts["2026020001"]?.awayScore, 1);
});