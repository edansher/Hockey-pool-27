// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import test from "node:test";
import type { DailyScoringRow, PoolStanding, StandingsSnapshot } from "./generated/api.schemas";
import { emptyScoringAlerts, expireScoringAlerts, updateScoringAlerts } from "./standings-scoring-alerts";

const date = "2026-10-03";
function player(changes: Partial<DailyScoringRow> = {}): DailyScoringRow {
  return { ownerId: "one", ownerName: "ONE", playerId: "12", playerName: "Matt Boldy", team: "MIN",
    goals: 0, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0, overtimeGoals: 0, hatTrick: false, poolPoints: 0, scoringBreakdown: [], ...changes };
}
function snapshot(scorers: DailyScoringRow[] | undefined, day = date, livePoints: number | null = 0): StandingsSnapshot {
  const row: PoolStanding = { id: "one", name: "ONE", rank: 1, previousRank: 1, rankMovement: 0,
    seasonPoints: 20, livePoints, yesterdayPoints: 2, playing: 4, gamesPlayed: 4, pointsPerGame: 5, transactionsUsed: 0, rosterComplete: true, todayScorers: scorers };
  return { date: day, asOf: null, status: "available", reason: null, rows: [row] };
}
const start = () => updateScoringAlerts(emptyScoringAlerts(), snapshot([]), 0, date);

test("opening standings establishes a silent baseline, including existing scores", () => {
  assert.equal(updateScoringAlerts(emptyScoringAlerts(), snapshot([player({ goals: 2, poolPoints: 4 })]), 10, date).alerts.length, 0);
});
test("new goal and assist arrive together, with all new players retained", () => {
  const state = updateScoringAlerts(start(), snapshot([
    player({ goals: 1, poolPoints: 2 }),
    player({ playerId: "13", playerName: "Another Player", assists: 1, poolPoints: 1 }),
  ]), 100, date);
  assert.deepEqual(state.alerts.map(a => [a.playerName, a.actions]), [["Matt Boldy", ["Goal"]], ["Another Player", ["Assist"]]]);
});
test("OT and shorthanded goals are not also announced as regular goals", () => {
  const state = updateScoringAlerts(start(), snapshot([player({ goals: 3, overtimeGoals: 1, shortHandedGoals: 1, assists: 1, poolPoints: 10 })]), 100, date);
  assert.deepEqual(state.alerts[0].actions, ["Goal", "Assist", "OT goal", "Shorthanded goal"]);
});
test("a power-play goal has its own label and the same one-minute expiry", () => {
  const state = updateScoringAlerts(start(), snapshot([player({ goals: 1, powerPlayGoals: 1, poolPoints: 4 })]), 100, date);
  assert.deepEqual(state.alerts[0].actions, ["Power-play goal"]);
  assert.equal(state.alerts[0].expiresAt, 60_100);
});
test("an overtime power-play winner preserves both descriptions without duplicating the goal", () => {
  assert.deepEqual(updateScoringAlerts(start(), snapshot([player({ goals: 1, powerPlayGoals: 1, overtimeGoals: 1, poolPoints: 4 })]), 100, date).alerts[0].actions, ["OT power-play goal"]);
});
test("regular and power-play goals arriving together retain both labels", () => {
  assert.deepEqual(updateScoringAlerts(start(), snapshot([player({ goals: 2, powerPlayGoals: 1, poolPoints: 6 })]), 100, date).alerts[0].actions, ["Goal", "Power-play goal"]);
});
test("multiple OT and power-play goals do not guess which goal had both attributes", () => {
  assert.deepEqual(updateScoringAlerts(start(), snapshot([player({ goals: 2, powerPlayGoals: 1, overtimeGoals: 1, poolPoints: 6 })]), 100, date).alerts[0].actions, ["Goals ×2", "OT goal", "Power-play goal"]);
});
test("power-play counters use new scoring, not an earlier goal's label", () => {
  const old = updateScoringAlerts(emptyScoringAlerts(), snapshot([player({ goals: 1, powerPlayGoals: 1, poolPoints: 4 })]), 0, date);
  const next = updateScoringAlerts(old, snapshot([player({ goals: 2, powerPlayGoals: 1, poolPoints: 6 })]), 100, date);
  assert.deepEqual(next.alerts[0].actions, ["Goal"]);
  assert.equal(updateScoringAlerts(next, snapshot([player({ goals: 2, powerPlayGoals: 1, poolPoints: 6 })]), 200, date).alerts.length, 1);
});
test("unchanged polling does not replay or extend the one-minute alert", () => {
  const scored = snapshot([player({ goals: 1, poolPoints: 2 })]);
  const first = updateScoringAlerts(start(), scored, 100, date);
  const again = updateScoringAlerts(first, scored, 20_000, date);
  assert.equal(again.alerts.length, 1);
  assert.equal(again.alerts[0].expiresAt, 60_100);
  assert.equal(expireScoringAlerts(again, 60_099).alerts.length, 1);
  assert.equal(expireScoringAlerts(again, 60_100).alerts.length, 0);
});
test("overlapping scorers expire independently without waiting for a new poll", () => {
  const first = updateScoringAlerts(start(), snapshot([player({ goals: 1, poolPoints: 2 })]), 100, date);
  const second = updateScoringAlerts(first, snapshot([player({ goals: 1, poolPoints: 2 }), player({ playerId: "13", assists: 1, poolPoints: 1 })]), 30_000, date);
  const expired = expireScoringAlerts(second, 60_100);
  assert.equal(expired.alerts.length, 1);
  assert.equal(expired.alerts[0].expiresAt, 90_000);
  assert.equal(expireScoringAlerts(expired, 90_000).alerts.length, 0);
});
test("multiple goals in one update retain their count", () => {
  assert.deepEqual(updateScoringAlerts(start(), snapshot([player({ goals: 2, assists: 2, poolPoints: 6 })]), 10, date).alerts[0].actions, ["Goal ×2", "Assist ×2"]);
});
test("missing evidence is not treated as a verified empty baseline", () => {
  const missing = updateScoringAlerts(emptyScoringAlerts(), snapshot(undefined), 0, date);
  assert.equal(updateScoringAlerts(missing, snapshot([player({ goals: 1, poolPoints: 2 })]), 10, date).alerts.length, 0);
  assert.equal(updateScoringAlerts(start(), snapshot([player({ goals: 1, poolPoints: 2 })], date, null), 10, date).alerts.length, 0);
});
test("historical days and the first update after day rollover stay silent", () => {
  const first = updateScoringAlerts(start(), snapshot([player({ goals: 1, poolPoints: 2 })]), 100, date);
  assert.equal(updateScoringAlerts(first, snapshot([player({ goals: 2, poolPoints: 4 })], "2026-10-02"), 200, date).alerts.length, 0);
  assert.equal(updateScoringAlerts(first, snapshot([player({ goals: 1, poolPoints: 2 })], "2026-10-04"), 200, "2026-10-04").alerts.length, 0);
});
test("stale responses and restored missing rows do not replay prior scoring", () => {
  const scored = snapshot([player({ goals: 1, poolPoints: 2 })]);
  const first = updateScoringAlerts(start(), scored, 100, date);
  const stale = updateScoringAlerts(first, snapshot([]), 70_000, date);
  assert.equal(updateScoringAlerts(stale, scored, 80_000, date).alerts.length, 0);
});
test("no newly earned points means no scoring alert", () => {
  assert.equal(updateScoringAlerts(start(), snapshot([player({ goals: 1, poolPoints: 0 })]), 10, date).alerts.length, 0);
});
test("retained ownership rows for one player are combined and assigned only to that owner", () => {
  const state = updateScoringAlerts(start(), snapshot([
    player({ goals: 1, poolPoints: 2 }),
    player({ assists: 1, poolPoints: 1 }),
    player({ ownerId: "other", playerId: "100", goals: 1, poolPoints: 2 }),
  ]), 10, date);
  assert.equal(state.alerts.length, 1);
  assert.deepEqual(state.alerts[0].actions, ["Goal", "Assist"]);
});