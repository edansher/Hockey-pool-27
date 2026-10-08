import assert from "node:assert/strict";
import test from "node:test";
import { isCalendarDate } from "./calendar-date";
import { unavailableDailyAnalysis } from "./daily-analysis";

test("unavailable nightly analysis preserves the requested game date without inventing results", () => {
  const report = unavailableDailyAnalysis("2026-09-30");
  assert.equal(report.date, "2026-09-30");
  assert.equal(report.status, "unavailable");
  assert.match(report.summary, /unavailable—not zero or estimated/);
  assert.deepEqual(report.owners, []);
  assert.deepEqual(report.scoring, []);
});

test("calendar-date validation rejects impossible, malformed, and repeated values", () => {
  for (const invalid of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-00-01", "2026-10-00", "2026-9-30", "2026-09-30T00:00:00Z", "", ["2026-09-30"], undefined]) {
    assert.equal(isCalendarDate(invalid), false);
  }
  assert.equal(isCalendarDate("2026-09-30"), true);
  assert.equal(isCalendarDate("2028-02-29"), true);
});