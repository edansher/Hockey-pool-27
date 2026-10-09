import type { DailyReportHealth } from "@workspace/api-zod";
import { torontoReportClock } from "./daily-report-builder";

type Category = NonNullable<DailyReportHealth["failureCategory"]>;
export type ReportStage = "database" | "scoring" | "generation" | "publication";
export const REPORT_GRACE_MINUTES = 15;

/** Only fixed categories leave the server. Error text is never returned. */
export function reportFailureCategory(error: unknown, stage: ReportStage, depth = 0): Category {
  const e = error as { code?: string; message?: string; cause?: unknown } | null;
  if (e?.code && /^(08|53|57P)/.test(e.code)) return "database_unavailable";
  if (e?.code && ["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND"].includes(e.code)) return "database_unavailable";
  if (typeof e?.message === "string" && /connection timeout|timeout exceeded when trying to connect|Connection terminated|query read timeout/i.test(e.message)) return "database_unavailable";
  if (depth < 4 && e?.cause && e.cause !== error && reportFailureCategory(e.cause, "publication", depth + 1) === "database_unavailable") return "database_unavailable";
  return stage === "database" ? "database_unavailable" :
    stage === "scoring" ? "scoring_not_verified" :
    stage === "generation" ? "report_generation_failed" : "publication_failed";
}

export class ReportHealthTracker {
  private lastAttemptAt: string | null = null;
  private attemptDate: string | null = null;
  private failure: Category | null = null;
  private publishedDate: string | null = null;
  private lastPublishedAt: string | null = null;
  private readonly observedSince: string;

  constructor(now = new Date()) { this.observedSince = now.toISOString(); }

  attempt(now: Date) {
    const { date } = torontoReportClock(now);
    if (this.publishedDate === date) return;
    this.attemptDate = date;
    this.lastAttemptAt = now.toISOString();
    this.failure = null;
  }

  failed(error: unknown, stage: ReportStage) {
    this.failure = reportFailureCategory(error, stage);
  }

  published(date: string, at: Date) {
    if (!this.lastPublishedAt || at.toISOString() >= this.lastPublishedAt) this.lastPublishedAt = at.toISOString();
    if (!this.publishedDate || date >= this.publishedDate) this.publishedDate = date;
    if (this.attemptDate === date) this.failure = null;
  }

  snapshot(now: Date, publicationVerified: boolean): DailyReportHealth {
    const clock = torontoReportClock(now);
    const minuteParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const minutes = Number(minuteParts.find(p => p.type === "hour")!.value) * 60 +
      Number(minuteParts.find(p => p.type === "minute")!.value);
    const published = this.publishedDate === clock.date;
    const status = published ? "published" : !clock.ready ? "scheduled" :
      minutes >= 8 * 60 + REPORT_GRACE_MINUTES ? "delayed" : "pending";
    return {
      reportDate: clock.date, status, publicationVerified: published || publicationVerified,
      graceMinutes: REPORT_GRACE_MINUTES, lastAttemptAt: this.lastAttemptAt,
      lastPublishedAt: this.lastPublishedAt, observedSince: this.observedSince,
      failureCategory: published || !clock.ready ? null : !publicationVerified ? "database_unavailable" :
        this.attemptDate === clock.date ? this.failure : null,
    };
  }
}
