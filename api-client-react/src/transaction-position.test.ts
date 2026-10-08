// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import test from "node:test";
import type { DraftRoster, Transaction } from "./generated/api.schemas";
import { transactionPlayerPosition } from "./transaction-position";

const transaction = (outgoing: unknown, incoming: unknown) => ({ details: { outgoing, incoming } }) as unknown as Transaction;

test("completed transactions label each recorded player's position", () => {
  const record = transaction({ position: "D" }, { position: "RW" });
  assert.equal(transactionPlayerPosition(record, "outgoing"), "Defense");
  assert.equal(transactionPlayerPosition(record, "incoming"), "Forward");
});

test("all skater forward positions share the Forward label", () => {
  for (const position of ["F", "C", "L", "R", "LW", "RW", " forward "]) {
    assert.equal(transactionPlayerPosition(transaction({ position }, null), "outgoing"), "Forward");
  }
});

test("missing or unrecognized historical evidence is not guessed", () => {
  for (const player of [null, {}, { position: "G" }, { position: 3 }, "D"]) {
    assert.equal(transactionPlayerPosition(transaction(player, null), "outgoing"), null);
  }
  assert.equal(transactionPlayerPosition({ details: null } as Transaction, "incoming"), null);
});

test("older transactions use exact NHL identity matches, while saved history takes precedence", () => {
  const rosters = [{ selections: [{ nhlPlayerId: 42, position: "D" }] }] as DraftRoster[];
  const legacy = { outgoingPlayerId: "42", details: null } as Transaction;
  assert.equal(transactionPlayerPosition(legacy, "outgoing", rosters), "Defense");
  assert.equal(transactionPlayerPosition({ ...legacy, outgoingPlayerId: "43" }, "outgoing", rosters), null);
  assert.equal(transactionPlayerPosition({ ...legacy, details: { outgoing: { position: "C" } } }, "outgoing", rosters), "Forward");
});