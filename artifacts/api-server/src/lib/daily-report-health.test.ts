import assert from "node:assert/strict";
import test from "node:test";
import { ReportHealthTracker, reportFailureCategory } from "./daily-report-health";

test("Toronto publication grace period has an exact 8:15 boundary", () => {
  const h = new ReportHealthTracker(new Date("2026-10-05T10:00:00Z"));
  for (const [iso, status] of [
    ["2026-10-05T11:59:59Z", "scheduled"],
    ["2026-10-05T12:00:00Z", "pending"],
    ["2026-10-05T12:14:59Z", "pending"],
    ["2026-10-05T12:15:00Z", "delayed"],
  ]) assert.equal(h.snapshot(new Date(iso), true).status, status);
  assert.equal(h.snapshot(new Date("2026-01-05T13:15:00Z"), true).status, "delayed");
  assert.equal(h.snapshot(new Date("2026-01-05T12:59:00Z"), true).status, "scheduled");
  // Toronto is still the preceding calendar day here.
  assert.equal(h.snapshot(new Date("2026-10-06T02:00:00Z"), true).reportDate, "2026-10-05");
});

test("failed retries show only safe categories and retain the last publication", () => {
  const h = new ReportHealthTracker();
  h.published("2026-10-04", new Date("2026-10-04T12:02:00Z"));
  h.attempt(new Date("2026-10-05T12:00:00Z"));
  h.failed(new Error("timeout exceeded when trying to connect: secret://password"), "database");
  h.attempt(new Date("2026-10-05T12:10:00Z"));
  h.failed({ cause: { code: "53300", message: "private connection details" } }, "scoring");
  const result = h.snapshot(new Date("2026-10-05T12:15:00Z"), false);
  assert.equal(result.status, "delayed");
  assert.equal(result.publicationVerified, false);
  assert.equal(result.failureCategory, "database_unavailable");
  assert.equal(result.lastAttemptAt, "2026-10-05T12:10:00.000Z");
  assert.equal(result.lastPublishedAt, "2026-10-04T12:02:00.000Z");
  assert.doesNotMatch(JSON.stringify(result), /secret|password|private connection/);
});

test("successful publication clears the warning and resets at the next Toronto day", () => {
  const h = new ReportHealthTracker();
  h.attempt(new Date("2026-10-05T12:00:00Z"));
  h.failed(new Error("not finalized"), "scoring");
  h.published("2026-10-05", new Date("2026-10-05T12:20:00Z"));
  const result = h.snapshot(new Date("2026-10-05T12:25:00Z"), false);
  assert.equal(result.status, "published");
  assert.equal(result.publicationVerified, true);
  assert.equal(result.failureCategory, null);
  h.attempt(new Date("2026-10-05T12:30:00Z"));
  assert.equal(h.snapshot(new Date("2026-10-05T12:30:00Z"), true).lastAttemptAt, "2026-10-05T12:00:00.000Z");
  const next = h.snapshot(new Date("2026-10-06T12:15:00Z"), true);
  assert.equal(next.status, "delayed");
  assert.equal(next.failureCategory, null, "do not carry yesterday's failure into today");
});

test("restart makes missing observations explicit, not invented", () => {
  const h = new ReportHealthTracker(new Date("2026-10-05T12:18:00Z"));
  const result = h.snapshot(new Date("2026-10-05T12:20:00Z"), false);
  assert.equal(result.lastAttemptAt, null);
  assert.equal(result.lastPublishedAt, null);
  assert.equal(result.observedSince, "2026-10-05T12:18:00.000Z");
  assert.equal(result.status, "delayed");
});

test("safe categories distinguish scoring, writing, publication, and wrapped database failures", () => {
  assert.equal(reportFailureCategory(new Error("not verified"), "scoring"), "scoring_not_verified");
  assert.equal(reportFailureCategory(new Error("AI response invalid"), "generation"), "report_generation_failed");
  assert.equal(reportFailureCategory(new Error("insert failed"), "publication"), "publication_failed");
  assert.equal(reportFailureCategory({ cause: { code: "ETIMEDOUT" } }, "scoring"), "database_unavailable");
});
