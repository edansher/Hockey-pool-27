import assert from "node:assert/strict";
import test from "node:test";
import { getPoolDates, getPreviousPoolDate } from "../src/index";

test("summer pool day continues through midnight and switches at 2am Toronto", () => {
  for (const instant of [
    "2026-10-02T03:59:59Z",
    "2026-10-02T04:00:00Z",
    "2026-10-02T05:59:59Z",
  ]) {
    assert.deepEqual(getPoolDates(new Date(instant)), {
      today: "2026-10-01", lastNight: "2026-09-30",
    });
  }
  assert.deepEqual(getPoolDates(new Date("2026-10-02T06:00:00Z")), {
    today: "2026-10-02", lastNight: "2026-10-01",
  });
});

test("winter boundary follows Toronto local time", () => {
  assert.equal(getPoolDates(new Date("2027-01-02T06:59:59Z")).today, "2027-01-01");
  assert.equal(getPoolDates(new Date("2027-01-02T07:00:00Z")).today, "2027-01-02");
});

test("spring-forward skips 2am and rolls over at the first valid time after it", () => {
  assert.equal(getPoolDates(new Date("2026-03-08T06:59:59Z")).today, "2026-03-07");
  assert.equal(getPoolDates(new Date("2026-03-08T07:00:00Z")).today, "2026-03-08");
});

test("fall-back keeps both repeated 1am hours in the same pool day", () => {
  for (const instant of [
    "2026-11-01T05:00:00Z", "2026-11-01T05:59:59Z",
    "2026-11-01T06:00:00Z", "2026-11-01T06:59:59Z",
  ]) {
    assert.equal(getPoolDates(new Date(instant)).today, "2026-10-31");
  }
  assert.equal(getPoolDates(new Date("2026-11-01T07:00:00Z")).today, "2026-11-01");
});

test("month, year and leap-day boundaries stay date-only", () => {
  assert.deepEqual(getPoolDates(new Date("2027-01-01T06:00:00Z")), {
    today: "2026-12-31", lastNight: "2026-12-30",
  });
  assert.equal(getPoolDates(new Date("2028-03-01T06:00:00Z")).today, "2028-02-29");
  assert.equal(getPreviousPoolDate(new Date("2028-03-01T06:00:00Z")), "2028-02-28");
  assert.throws(() => getPoolDates(new Date(NaN)), RangeError);
});