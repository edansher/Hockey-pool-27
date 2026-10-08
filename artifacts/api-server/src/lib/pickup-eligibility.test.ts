import { test } from "node:test";
import assert from "node:assert/strict";
import { cutoffEligibility, ownershipGameEligibility, torontoDate } from "./pickup-eligibility";
import { requireRosterComposition } from "./transaction-policy";
import { transactionAccounting } from "./transaction-accounting";
import type { DraftRosterSelection } from "@workspace/db";

const selection: DraftRosterSelection = { round: 21, originalText: "Replacement",
  assetType: "skater", position: "F", reviewNote: null, nhlPlayerId: 90000001,
  acquiredAt: "2026-10-02T22:59:01.000Z", eligibilityPolicy: "scheduled-minus-one-minute" };
test("exact one-minute cutoff accepts equality, rejects a second and a millisecond late", () => {
  const start = "2026-10-02T23:00:00.000Z";
  assert.equal(cutoffEligibility("2026-10-02T22:59:00.000Z", start), true);
  assert.equal(cutoffEligibility("2026-10-02T22:59:00.001Z", start), false);
  assert.equal(cutoffEligibility("2026-10-02T22:59:01.000Z", start), false);
});
test("missing scheduled time is pending, not a promise or guessed eligibility", () => {
  assert.equal(cutoffEligibility(selection.acquiredAt!, null), null);
  assert.equal(ownershipGameEligibility(selection, 1, "2026-10-02"), null);
});
test("opening before cutoff does not establish ownership; delayed puck drop changes nothing", () => {
  assert.equal(ownershipGameEligibility(selection, 1, "2026-10-02", "2026-10-02T23:00:00Z"), false);
});
test("missed game stays excluded through corrections; next eligible following day counts", () => {
  const late = { ...selection, scoringExcludedGameIds: [1], eligibleAfterGameDate: "2026-10-02" };
  assert.equal(ownershipGameEligibility(late, 1, "2026-10-02", "2026-10-03T02:00:00Z"), false);
  assert.equal(ownershipGameEligibility(late, 2, "2026-10-02", "2026-10-03T03:00:00Z"), false);
  assert.equal(ownershipGameEligibility(late, 3, "2026-10-03", "2026-10-03T23:00:00Z"), true);
  assert.equal(ownershipGameEligibility(late, 4, "2026-10-01", "2026-10-01T23:00:00Z"), false);
});
test("recorded scheduled deadline survives a later delayed schedule refresh", () => {
  const saved = { ...selection, eligibilityGames: [{ gameId: 1, gameDate: "2026-10-02",
    scheduledStart: "2026-10-02T23:00:00Z", cutoff: "2026-10-02T22:59:00Z", eligible: false }] };
  assert.equal(ownershipGameEligibility(saved, 1, "2026-10-02", "2026-10-03T02:00:00Z"), false);
});
test("legacy manually credited periods retain their existing scoring policy", () => {
  const legacy = { ...selection, eligibilityPolicy: undefined };
  assert.equal(ownershipGameEligibility(legacy, 1, "2026-10-02"), true);
});
test("Toronto date is calendar based and handles daylight saving offsets", () => {
  assert.equal(torontoDate(new Date("2026-10-03T02:00:00Z")), "2026-10-02");
  assert.equal(torontoDate(new Date("2026-11-02T04:30:00Z")), "2026-11-01");
  assert.equal(torontoDate(new Date("2026-11-02T05:30:00Z")), "2026-11-02");
});
test("participant composition requires 13F, 5D and two goalie teams", () => {
  const roster = [
    ...Array.from({ length: 13 }, () => ({ assetType: "skater", position: "F" })),
    ...Array.from({ length: 5 }, () => ({ assetType: "skater", position: "D" })),
    ...Array.from({ length: 2 }, () => ({ assetType: "goalieTeam", position: "G" })),
  ];
  assert.doesNotThrow(() => requireRosterComposition(roster));
  assert.throws(() => requireRosterComposition(roster.slice(1)), /exactly/);
});
test("allowance corrections affect counts only; reversals void the fee without deleting ledger history", () => {
  const owners = [{ id: "test-owner", name: "Test" }];
  const ledger = [{ ownerId: "test-owner", paid: false }, { ownerId: "test-owner", paid: true, reversedAt: new Date() }];
  const result = transactionAccounting(owners, ledger, [{ ownerId: "test-owner", transactionLimit: 12, countAdjustment: 2 }]);
  assert.equal(result.totalCompletedTransactions, 1);
  assert.equal(result.participants[0]!.dropsUsed, 3);
  assert.equal(result.participants[0]!.dropsLeft, 9);
  assert.equal(result.participants[0]!.transactionSpend, 50);
  assert.equal(result.participants[0]!.amountOwing, 50);
});