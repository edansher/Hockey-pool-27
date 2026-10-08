import assert from "node:assert/strict";
import test from "node:test";
import { formatPoolCalendarDate, getPreviousTorontoDate } from "../src/pool-calendar.ts";

test("last night uses Toronto's day even when UTC has already rolled over", () => {
  assert.equal(getPreviousTorontoDate(new Date("2026-10-01T03:00:00Z")), "2026-09-29");
  assert.equal(getPreviousTorontoDate(new Date("2026-10-01T04:01:00Z")), "2026-09-30");
});

test("spring and autumn DST changes use calendar subtraction, not 24-hour subtraction", () => {
  assert.equal(getPreviousTorontoDate(new Date("2026-03-09T04:10:00Z")), "2026-03-08");
  assert.equal(getPreviousTorontoDate(new Date("2026-11-02T04:30:00Z")), "2026-10-31");
  assert.equal(getPreviousTorontoDate(new Date("2026-11-02T05:30:00Z")), "2026-11-01");
});

test("month, leap day, and year boundaries preserve an ISO calendar date", () => {
  assert.equal(getPreviousTorontoDate(new Date("2028-03-01T05:30:00Z")), "2028-02-29");
  assert.equal(getPreviousTorontoDate(new Date("2027-01-01T05:30:00Z")), "2026-12-31");
});

test("coverage dates format as their wire calendar day without a Toronto timezone shift", () => {
  assert.equal(formatPoolCalendarDate("2026-10-01"), "Oct 1, 2026");
  assert.equal(formatPoolCalendarDate("2026-02-29"), null);
  assert.equal(formatPoolCalendarDate(null), null);
});