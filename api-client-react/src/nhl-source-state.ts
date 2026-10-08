import { POOL_REFRESH_INTERVAL_MS } from "./refresh";

/** Structural subset of NhlSourceSnapshot so this helper stays pure and testable. */
export interface SourceLike {
  status: "starting" | "available" | "stale" | "unavailable";
  isRefreshing: boolean;
  lastSuccessAt: string | null;
  error: string | null;
  today: { date: string } | null;
  lastNight: { date: string } | null;
}

export type EffectiveStatus = "loading" | "starting" | "available" | "stale" | "unavailable";
export type StaleReason = "fetchFailed" | "aged" | "dayRollover" | "serverStale";

export interface SourceView {
  status: EffectiveStatus;
  /** True only when the server state is known (last fetch succeeded). */
  isRefreshing: boolean;
  /** Games shown come from a cached or aged snapshot and must carry a dated label. */
  cached: boolean;
  reasons: StaleReason[];
  ageMs: number | null;
  message: string | null;
}

const toronto = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
export function getTorontoDate(now: number | Date = Date.now()): string {
  const parts = toronto.formatToParts(now);
  const v = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

export function deriveSourceView(data: SourceLike | undefined, fetchFailed: boolean, nowMs: number = Date.now()): SourceView {
  if (!data) {
    return fetchFailed
      ? { status: "unavailable", isRefreshing: false, cached: false, reasons: ["fetchFailed"], ageMs: null, message: "NHL server status can't be verified and no earlier NHL data is saved on this device." }
      : { status: "loading", isRefreshing: false, cached: false, reasons: [], ageMs: null, message: null };
  }
  const success = data.lastSuccessAt ? Date.parse(data.lastSuccessAt) : NaN;
  const ageMs = Number.isFinite(success) ? Math.max(0, nowMs - success) : null;
  const reasons: StaleReason[] = [];
  if (fetchFailed) reasons.push("fetchFailed");
  if (ageMs !== null && ageMs > 2 * POOL_REFRESH_INTERVAL_MS) reasons.push("aged");
  if (data.today && data.today.date !== getTorontoDate(nowMs)) reasons.push("dayRollover");
  if (data.status === "stale" || data.status === "unavailable") reasons.push("serverStale");

  if (reasons.length === 0) {
    return { status: data.status === "starting" ? "starting" : "available", isRefreshing: data.isRefreshing, cached: false, reasons, ageMs, message: null };
  }
  const hasFacts = ageMs !== null && (data.today !== null || data.lastNight !== null);
  const status: EffectiveStatus = ageMs === null ? "unavailable" : "stale";
  let message: string;
  if (reasons.includes("fetchFailed")) message = "NHL server status can't be verified from this device right now. Showing the last saved NHL facts, which may be out of date.";
  else if (data.error) message = `The latest NHL check did not succeed. Showing the last good NHL facts. ${data.error}`;
  else if (reasons.includes("dayRollover")) message = "The saved NHL snapshot is for an earlier Toronto day. It is not today's schedule.";
  else if (reasons.includes("aged")) message = "The last successful NHL check is older than expected. These facts may be out of date.";
  else message = "The NHL source snapshot is marked stale. Awaiting a verified update.";
  if (status === "unavailable") message = "NHL scores are unavailable and no earlier NHL data was saved.";
  return { status, isRefreshing: fetchFailed || reasons.includes("aged") ? false : data.isRefreshing, cached: hasFacts, reasons, ageMs, message };
}
