import assert from "node:assert/strict";
import test from "node:test";
import { applyOwnershipScore, fixedOwnershipScore, subtractOwnershipBaseline, type OwnershipScore } from "./ownership-scoring";
import type { DraftRosterSelection } from "@workspace/db";
import type { PoolScoringRow } from "./pool-scoring-service";

const score = (points: number): OwnershipScore => ({
  goals: points, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0, overtimeGoals: 0,
  poolPoints: points, gamesPlayed: points, wins: null, shutouts: null,
});
const selection: DraftRosterSelection = {
  round: 15, originalText: "Duchene", assetType: "skater", position: "F", reviewNote: null,
  nhlPlayerId: 8475168,
};
const row: PoolScoringRow = { ownerId: "cohen", round: 15, nhlPlayerId: 8475168,
  assetType: "skater", ...score(20) };

test("dropped contribution stays frozen even when the player earns future points", () => {
  const dropped = { ...selection, droppedAt: "2026-10-02T13:00:00Z", frozenScoring: score(8) };
  assert.equal(applyOwnershipScore(dropped, row, "2026-10-02").poolPoints, 8);
  assert.equal(applyOwnershipScore(dropped, { ...row, ...score(99) }, "2026-10-03").poolPoints, 8);
  assert.equal(applyOwnershipScore(dropped, row, "2026-10-01").poolPoints, 20);
});
test("pickup gets only the points earned after its live-game baseline", () => {
  assert.equal(subtractOwnershipBaseline(score(20), score(8)).poolPoints, 12);
  assert.equal(subtractOwnershipBaseline(score(8), score(8)).poolPoints, 0);
  assert.equal(subtractOwnershipBaseline({ ...score(20), poolPoints: null }, score(8)).poolPoints, null);
  assert.equal(fixedOwnershipScore({ ...selection, acquiredAt: "2026-10-02T13:00:00Z" }, "2026-10-01")?.poolPoints, 0);
});