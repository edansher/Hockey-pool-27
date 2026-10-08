import assert from "node:assert/strict";
import test from "node:test";
import { transactionAccounting } from "./transaction-accounting";

test("paid drops reduce owing, not fees, counts or the pot; unpaid corrections restore owing", () => {
  const owners = [{ id: 'a', name: 'A' }];
  const unpaid = transactionAccounting(owners, [{ ownerId: 'a', paid: false }, { ownerId: 'a', paid: false }]);
  const paid = transactionAccounting(owners, [{ ownerId: 'a', paid: true }, { ownerId: 'a', paid: false }]);
  assert.equal(unpaid.participants[0]!.amountOwing, 100);
  assert.equal(paid.participants[0]!.amountOwing, 50);
  assert.equal(paid.participants[0]!.transactionSpend, 100);
  assert.equal(paid.totalPoolEarnings, unpaid.totalPoolEarnings);
  assert.equal(paid.participants[0]!.dropsUsed, unpaid.participants[0]!.dropsUsed);
  assert.deepEqual(paid.payouts, unpaid.payouts);
  assert.equal(transactionAccounting(owners, [{ ownerId: 'a', paid: true }]).participants[0]!.amountOwing, 0);
});

const owners = Array.from({ length: 9 }, (_, index) => ({ id: `owner-${index}`, name: `Participant ${index}` }));

test("nine paid entries always start the pool at $2700 with nine drops each", () => {
  const result = transactionAccounting(owners, []);
  assert.equal(result.totalPoolEarnings, 2700);
  assert.equal(result.totalCompletedTransactions, 0);
  assert.ok(result.participants.every(row => row.dropsUsed === 0 && row.dropsLeft === 9 && row.amountOwing === 0));
});

test("each completed pair adds only one $50 fee across the whole pool", () => {
  for (const count of [1, 2, 3, 4, 5, 10, 20]) {
    const rows = Array.from({ length: count }, (_, index) => ({ ownerId: owners[index % 9]!.id }));
    const result = transactionAccounting(owners, rows);
    assert.equal(result.totalPoolEarnings, 2700 + count * 50);
    assert.equal(result.totalCompletedTransactions, count);
    assert.equal(result.participants.reduce((total, row) => total + row.transactionSpend, 0), count * 50);
  }
});

test("ninth transaction reaches zero drops and transaction spend excludes the entry fee", () => {
  const result = transactionAccounting(owners, Array.from({ length: 9 }, () => ({ ownerId: owners[0]!.id })));
  assert.equal(result.participants[0]!.dropsUsed, 9);
  assert.equal(result.participants[0]!.dropsLeft, 0);
  assert.equal(result.participants[0]!.amountOwing, 450);
  assert.equal(result.participants[0]!.transactionSpend, 450);
  assert.equal(result.totalPoolEarnings, 3150);
  assert.throws(() => transactionAccounting(owners, Array.from({ length: 10 }, () => ({ ownerId: owners[0]!.id }))), /limit/);
  assert.throws(() => transactionAccounting(owners, [{ ownerId: "unknown" }]), /not in the pool/);
});

test("season-end payouts use 65%, 25% and 10% of the current full pot; two-way ties split only that place", () => {
  const result = transactionAccounting(owners, [{ ownerId: owners[0]!.id }]);
  assert.deepEqual(result.payouts, [
    { place: 1, percentage: 65, amount: 1787.5, twoWayTieAmount: 893.75 },
    { place: 2, percentage: 25, amount: 687.5, twoWayTieAmount: 343.75 },
    { place: 3, percentage: 10, amount: 275, twoWayTieAmount: 137.5 },
  ]);
});

test("payouts update with every transaction and distribute 100% without altering fees or drop counts", () => {
  for (let count = 0; count <= 81; count++) {
    const result = transactionAccounting(owners, Array.from({ length: count }, (_, i) => ({ ownerId: owners[i % 9]!.id })));
    assert.equal(result.payouts.reduce((sum, payout) => sum + payout.amount, 0), result.totalPoolEarnings);
    assert.equal(result.payouts.reduce((sum, payout) => sum + payout.percentage, 0), 100);
    assert.ok(result.payouts.every(payout => payout.twoWayTieAmount * 2 === payout.amount));
  }
});