import assert from "node:assert/strict";
import test from "node:test";
import { transactionPlayerTeam } from "./transaction-team.ts";

const rosters = [{ selections: [
  { nhlPlayerId: 10, confirmedTeam: "Dallas Stars", droppedAt: "2026-10-01" },
  { nhlPlayerId: 20, confirmedTeam: "Pittsburgh Penguins" },
] }];

test("uses each side's saved team without changing transactions or rosters", () => {
  const transaction = { outgoingPlayerId: "10", incomingPlayerId: "20",
    details: { outgoing: { team: " Philadelphia Flyers " }, incoming: { team: "San Jose Sharks" } } };
  const original = structuredClone({ transaction, rosters });
  assert.equal(transactionPlayerTeam(transaction, "outgoing", rosters), "Philadelphia Flyers");
  assert.equal(transactionPlayerTeam(transaction, "incoming", rosters), "San Jose Sharks");
  assert.deepEqual({ transaction, rosters }, original);
});

test("resolves legacy history by exact NHL ID, including retained dropped players", () => {
  const transaction = { outgoingPlayerId: "10", incomingPlayerId: "20", details: null };
  assert.equal(transactionPlayerTeam(transaction, "outgoing", rosters), "Dallas Stars");
  assert.equal(transactionPlayerTeam(transaction, "incoming", rosters), "Pittsburgh Penguins");
});

test("does not guess an NHL team from a name or an unknown identifier", () => {
  const transaction = { outgoingPlayerId: null, outgoingPlayerName: "Duchene",
    incomingPlayerId: "999", details: {} };
  assert.equal(transactionPlayerTeam(transaction, "outgoing", rosters), null);
  assert.equal(transactionPlayerTeam(transaction, "incoming", rosters), null);
});

test("handles missing, blank, and malformed snapshots without inventing teams", () => {
  for (const outgoing of [null, [], "Dallas", { team: 123 }, { team: " " }]) {
    assert.equal(transactionPlayerTeam({ outgoingPlayerId: "10", details: { outgoing } }, "outgoing", rosters), "Dallas Stars");
    assert.equal(transactionPlayerTeam({ details: { outgoing } }, "outgoing"), null);
  }
});
