import assert from "node:assert/strict";
import test from "node:test";
import { formatStandingsScoringTypes } from "./standings-scoring-types.ts";

const player = (patch = {}) => ({
  ownerId: "fixture-owner", ownerName: "Fixture", playerId: "fixture-player",
  playerName: "Fixture player", team: "MIN", goals: 0, assists: 0,
  powerPlayGoals: 0, shortHandedGoals: 0, overtimeGoals: 0,
  hatTrick: false, poolPoints: 0, scoringBreakdown: [], ...patch,
});
const reason = (label, count = 1, points = count) => ({ label, count, points, note: null });

test("matches the user's twelve-point example without counting OT goals twice", () => {
  const boldy = player({ goals: 2, assists: 2, overtimeGoals: 1, poolPoints: 6,
    scoringBreakdown: [reason("Goal"), reason("Assist", 2), reason("Overtime goal", 1, 3)] });
  const kaprizov = player({ goals: 1, assists: 1, shortHandedGoals: 1, poolPoints: 6,
    scoringBreakdown: [reason("Short-handed goal", 1, 5), reason("Assist")] });
  assert.equal(formatStandingsScoringTypes(boldy), "1 G, 2 A, 1 OTG");
  assert.equal(formatStandingsScoringTypes(kaprizov), "1 A, 1 SH");
  assert.equal(boldy.poolPoints + kaprizov.poolPoints, 12);
});

test("combines repeated categories and keeps verified OT power-play bonuses", () => {
  const row = player({ scoringBreakdown: [reason("Goal"), reason("Goal"), reason("Power-play goal"),
    reason("Overtime goal"), reason("Power-play goal bonus"), reason("Assist", 3)] });
  assert.equal(formatStandingsScoringTypes(row), "2 G, 3 A, 2 PPG, 1 OTG");
});

test("identifies hat-trick scoring and actual individual goalie wins, including shutout wins", () => {
  assert.equal(formatStandingsScoringTypes(player({ goals: 3, hatTrick: true,
    scoringBreakdown: [reason("Hat trick"), reason("Power-play goal bonus")] })), "1 PPG, 1 HAT");
  assert.equal(formatStandingsScoringTypes(player({
    scoringBreakdown: [reason("Goalie win"), reason("Goalie shutout win"), reason("Goalie assist"), reason("Goalie goal")] })),
  "1 G, 1 A, 2 W");
  assert.equal(formatStandingsScoringTypes(player({ team: "MIN", scoringBreakdown: [reason("Goalie assist")] })), "1 A");
});

test("does not fabricate regular goals or a hat trick from ownership-adjusted counters", () => {
  assert.equal(formatStandingsScoringTypes(player({ goals: 1, assists: 1, powerPlayGoals: 1,
    overtimeGoals: 1, hatTrick: true, scoringBreakdown: [reason("Points earned after pickup")] })),
  "1 G total, 1 A, 1 PPG, 1 OTG (goal types may overlap)");
  assert.equal(formatStandingsScoringTypes(player({ poolPoints: 3,
    scoringBreakdown: [reason("Points retained before administrator removal", 1, 3)] })),
  "Scoring type details pending");
});

test("ignores invalid counts and does not mutate source scoring", () => {
  const row = player({ scoringBreakdown: [reason("Goal", -1), reason("Assist", 0), reason("Goalie win", 0.5),
    reason("Unknown", 1), reason("  ASSIST  ", 2)] });
  const before = JSON.stringify(row);
  assert.equal(formatStandingsScoringTypes(row), "2 A");
  assert.equal(JSON.stringify(row), before);
});
