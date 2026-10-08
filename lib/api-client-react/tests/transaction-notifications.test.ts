import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTransactionTime, latestCompletedTransaction,
  transactionFlashRemainingMs, transactionButtonRemainingMs, TRANSACTION_FLASH_WINDOW_MS,
  transactionAlertRemainingMs, transactionTickerRemainingMs, TRANSACTION_SOUND_DURATION_MS, recentCompletedTransactions,
} from "../src/transaction-notifications";

test("button flashing expires exactly 24 hours after the drop, not after a visit", () => {
  const madeAt = "2026-10-02T04:30:12.123Z";
  const start = Date.parse(madeAt);
  assert.equal(TRANSACTION_FLASH_WINDOW_MS, 86_400_000);
  assert.equal(transactionFlashRemainingMs(madeAt, start), 86_400_000);
  assert.equal(transactionFlashRemainingMs(madeAt, start + 5 * 60 * 60 * 1000), 68_400_000);
  assert.equal(transactionFlashRemainingMs(madeAt, start + 23 * 60 * 60 * 1000), 3_600_000);
  assert.equal(transactionFlashRemainingMs(madeAt, start + 86_400_000 - 1), 1);
  assert.equal(transactionFlashRemainingMs(madeAt, start + 86_400_000), 0);
  assert.equal(transactionFlashRemainingMs(madeAt, start + 86_400_001), 0);
  assert.equal(transactionFlashRemainingMs(new Date(madeAt), start), 86_400_000);
});

test("actual drop time controls the alert even when the record is created later", () => {
  const effectiveAt = "2026-10-02T13:14:01.093Z";
  const createdAt = "2026-10-02T15:14:01.093Z";
  const transaction = { id: "real", effectiveAt, createdAt };
  assert.equal(TRANSACTION_SOUND_DURATION_MS, 25_000);
  assert.equal(transactionAlertRemainingMs(transaction, Date.parse(effectiveAt)), 18_000_000);
  assert.equal(transactionAlertRemainingMs(transaction, Date.parse(effectiveAt) + 18_000_000), 0);
  assert.equal(latestCompletedTransaction([
    transaction,
    { id: "older-drop-newer-record", effectiveAt: "2026-10-02T12:00:00Z", createdAt: "2026-10-02T16:00:00Z" },
  ])?.id, "real");
});

test("24 elapsed hours are unchanged by DST, invalid dates, or future records", () => {
  for (const stamp of ["2026-03-08T06:30:00Z", "2026-11-01T05:30:00Z"]) {
    const start = Date.parse(stamp);
    assert.equal(transactionFlashRemainingMs(stamp, start + 86_399_999), 1);
    assert.equal(transactionFlashRemainingMs(stamp, start + 86_400_000), 0);
  }
  assert.equal(transactionFlashRemainingMs("invalid"), 0);
  assert.equal(transactionFlashRemainingMs(null), 0);
  assert.equal(transactionFlashRemainingMs("2026-10-02T04:30:00Z", Date.parse("2026-10-02T04:29:59Z")), 0);
});

test("actual transaction time is Toronto calendar time, not the prior 2am pool day", () => {
  const label = formatTransactionTime("2026-10-02T04:30:12.000Z");
  assert.match(label, /Friday/);
  assert.match(label, /October 2, 2026/);
  assert.match(label, /12:30:12/);
  assert.match(label, /EDT/);
  assert.doesNotMatch(label, /October 1/);
});

test("UTC midnight never shifts transaction history to the wrong Toronto calendar date", () => {
  const label = formatTransactionTime("2026-10-02T02:30:12.000Z");
  assert.match(label, /Thursday/);
  assert.match(label, /October 1, 2026/);
  assert.match(label, /10:30:12/);
});

test("fall DST repeated hour retains the actual EDT/EST distinction", () => {
  const first = formatTransactionTime("2026-11-01T05:30:00.000Z");
  const second = formatTransactionTime("2026-11-01T06:30:00.000Z");
  assert.match(first, /1:30:00.*EDT/);
  assert.match(second, /1:30:00.*EST/);
  assert.equal(formatTransactionTime("not a timestamp"), "Transaction time unavailable");
});

test("only real completed non-reversed entries can trigger a notice", () => {
  assert.equal(latestCompletedTransaction([]), null);
  const older = { id: "one", createdAt: "2026-10-01T18:00:00Z", reversedAt: null };
  const newer = { id: "two", createdAt: "2026-10-02T04:00:00Z", reversedAt: null };
  assert.equal(latestCompletedTransaction([
    newer,
    { id: "invalid", createdAt: "bad" },
    older,
    { id: "reversed", createdAt: "2026-10-03T04:00:00Z", reversedAt: "2026-10-03T05:00:00Z" },
  ]), newer);
  assert.equal(latestCompletedTransaction([older, newer]), newer);
});

const now = Date.parse("2026-10-02T17:00:00Z");
const hour = 60 * 60 * 1000;
const drop = (id: string, hoursAgo: number) => ({ id, createdAt: new Date(now - hoursAgo * hour).toISOString() });

test("button and ticker stay active after the unchanged five-hour sound window", () => {
  const transaction = drop("six-hours-old", 6);
  assert.equal(transactionButtonRemainingMs([transaction], now), 18 * hour);
  assert.equal(transactionAlertRemainingMs(transaction, now), 0);
  assert.deepEqual(recentCompletedTransactions([transaction], now), [transaction]);
  assert.equal(transactionTickerRemainingMs(transaction, now), 18 * hour);
  assert.equal(transactionTickerRemainingMs(transaction, now + 18 * hour - 1), 1);
  assert.equal(transactionTickerRemainingMs(transaction, now + 18 * hour), 0);
  assert.deepEqual(recentCompletedTransactions([transaction], now + 18 * hour), []);
  assert.equal(transactionButtonRemainingMs([transaction], now + 18 * hour - 1), 1);
  assert.equal(transactionButtonRemainingMs([transaction], now + 18 * hour), 0);
});

test("button uses effective drop time and ignores reversed, future, invalid or missing-id records", () => {
  const transaction = { ...drop("recorded-now", 0), effectiveAt: new Date(now - 23 * hour) };
  const invalid = [
    { ...drop("reversed", 0), reversedAt: new Date(now).toISOString() },
    drop("future", -1), { id: "bad", createdAt: "invalid" }, { ...drop("missing", 0), id: "" },
  ];
  assert.equal(transactionButtonRemainingMs([transaction, ...invalid], now), hour);
  assert.equal(transactionButtonRemainingMs(invalid, now), 0);
  assert.equal(transactionButtonRemainingMs([], now), 0);
  assert.equal(transactionButtonRemainingMs([transaction], Number.NaN), 0);
  assert.equal(transactionButtonRemainingMs([drop("older", 23), drop("newer", 2)], now), 22 * hour);
});

test("overlapping drops remain in the ticker, newest first, without mutating history", () => {
  const records = [drop("older", 4), drop("newer", 1)];
  const original = structuredClone(records);
  assert.deepEqual(recentCompletedTransactions(records, now).map(t => t.id), ["newer", "older"]);
  assert.deepEqual(records, original);
});

test("each ticker message expires independently at exactly 24 hours, not when a newer drop arrives", () => {
  const records = [drop("older", 23), drop("newer", 1)];
  assert.equal(recentCompletedTransactions(records, now + hour - 1).length, 2);
  assert.deepEqual(recentCompletedTransactions(records, now + hour).map(t => t.id), ["newer"]);
  assert.deepEqual(recentCompletedTransactions(records, now + 23 * hour), []);
});

test("ticker uses the effective drop instant without restarting it on a visit", () => {
  const recordedLate = { ...drop("late-entry", 0), effectiveAt: new Date(now - 23 * hour) };
  assert.equal(transactionTickerRemainingMs(recordedLate, now), hour);
  assert.equal(recentCompletedTransactions([recordedLate], now + hour).length, 0);
});

test("reversed, future, invalid and duplicate records are not additional ticker messages", () => {
  const valid = drop("active", 2);
  assert.deepEqual(recentCompletedTransactions([
    { ...drop("reversed", 1), reversedAt: new Date(now).toISOString() },
    drop("future", -1), { id: "bad", createdAt: "invalid" }, { ...valid, id: "" },
    valid, valid,
  ], now).map(t => t.id), ["active"]);
});

test("ticker ordering is stable for equal timestamps; empty history has no alerts", () => {
  assert.deepEqual(recentCompletedTransactions([drop("a", 0), drop("b", 0)], now).map(t => t.id), ["b", "a"]);
  assert.deepEqual(recentCompletedTransactions([], now), []);
});
