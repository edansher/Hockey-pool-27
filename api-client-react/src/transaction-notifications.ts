export type TransactionNotice = {
  id: string;
  createdAt: string | Date;
  effectiveAt?: string | Date;
  reversedAt?: string | Date | null;
};

export const TRANSACTION_FLASH_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRANSACTION_TICKER_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRANSACTION_ALERT_WINDOW_MS = 5 * 60 * 60 * 1000;
export const TRANSACTION_SOUND_DURATION_MS = 25_000;
export const TRANSACTION_TICKER_INTERVAL_MS = 8_000;

/** Keep each unreversed drop visible for its own 24-hour ticker window. */
export function recentCompletedTransactions<T extends TransactionNotice>(
  records: readonly T[], nowMs = Date.now(),
): T[] {
  const unique = new Map<string, T>();
  for (const record of records) {
    if (!record.id || record.reversedAt || transactionTickerRemainingMs(record, nowMs) <= 0) continue;
    unique.set(record.id, record);
  }
  const instant = (record: T) => {
    const value = record.effectiveAt ?? record.createdAt;
    return value instanceof Date ? value.getTime() : Date.parse(value);
  };
  return [...unique.values()].sort((a, b) => instant(b) - instant(a) || b.id.localeCompare(a.id));
}

/** Sound eligibility remains independent from the ticker and button windows. */
export function transactionAlertRemainingMs(
  transaction: TransactionNotice | null | undefined, nowMs = Date.now(),
): number {
  return transactionWindowRemainingMs(transaction?.effectiveAt ?? transaction?.createdAt, nowMs, TRANSACTION_ALERT_WINDOW_MS);
}

/** The drop instant wins over recording time; visits do not restart the ticker. */
export function transactionTickerRemainingMs(
  transaction: TransactionNotice | null | undefined, nowMs = Date.now(),
): number {
  return transactionWindowRemainingMs(transaction?.effectiveAt ?? transaction?.createdAt, nowMs, TRANSACTION_TICKER_WINDOW_MS);
}

/** Flash while any real, unreversed transaction is inside its own 24-hour window. */
export function transactionButtonRemainingMs(
  records: readonly TransactionNotice[], nowMs = Date.now(),
): number {
  let remaining = 0;
  for (const record of records) {
    if (!record.id || record.reversedAt) continue;
    remaining = Math.max(remaining, transactionFlashRemainingMs(record.effectiveAt ?? record.createdAt, nowMs));
  }
  return remaining;
}

/** Elapsed time from the backend record, not from a visit or an acknowledgement. */
export function transactionFlashRemainingMs(
  createdAt: string | Date | null | undefined,
  nowMs = Date.now(),
): number {
  return transactionWindowRemainingMs(createdAt, nowMs, TRANSACTION_FLASH_WINDOW_MS);
}

function transactionWindowRemainingMs(
  createdAt: string | Date | null | undefined, nowMs: number, windowMs: number,
): number {
  if (!createdAt || !Number.isFinite(nowMs)) return 0;
  const startedAt = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(startedAt) || startedAt > nowMs) return 0;
  return Math.max(0, startedAt + windowMs - nowMs);
}

const transactionClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/** Transaction history shows real calendar time, never the 2am pool-day label. */
export function formatTransactionTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? transactionClock.format(date)
    : "Transaction time unavailable";
}

export function latestCompletedTransaction<T extends TransactionNotice>(
  records: readonly T[],
): T | null {
  let latest: T | null = null;
  let latestTime = -Infinity;
  for (const record of records) {
    if (record.reversedAt || !record.id) continue;
    const instant = record.effectiveAt ?? record.createdAt;
    const time = instant instanceof Date ? instant.getTime() : Date.parse(instant);
    if (!Number.isFinite(time)) continue;
    if (time > latestTime || (time === latestTime && record.id > (latest?.id ?? ""))) {
      latest = record;
      latestTime = time;
    }
  }
  return latest;
}
