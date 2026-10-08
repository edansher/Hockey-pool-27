import assert from "node:assert/strict";
import test from "node:test";
import { deriveSourceView, getTorontoDate, type SourceLike } from "../src/nhl-source-state";

const base: SourceLike = { status: "available", isRefreshing: false, lastSuccessAt: "2026-10-10T16:00:00Z", error: null, today: { date: "2026-10-10" }, lastNight: { date: "2026-10-09" } };
const at = (iso: string) => Date.parse(iso);

test("fresh same-day snapshot is available", () => {
  const v = deriveSourceView(base, false, at("2026-10-10T16:02:00Z"));
  assert.equal(v.status, "available");
  assert.equal(v.cached, false);
});

test("retained API error overrides available/refreshing and keeps cached facts", () => {
  const v = deriveSourceView({ ...base, isRefreshing: true }, true, at("2026-10-10T16:02:00Z"));
  assert.equal(v.status, "stale");
  assert.equal(v.isRefreshing, false);
  assert.equal(v.cached, true);
  assert.ok(v.reasons.includes("fetchFailed"));
});

test("error with no cache is unavailable", () => {
  assert.equal(deriveSourceView(undefined, true).status, "unavailable");
  assert.equal(deriveSourceView(undefined, false).status, "loading");
});

test("age beyond two intervals is stale without provider failure", () => {
  const v = deriveSourceView({ ...base, isRefreshing: true }, false, at("2026-10-10T16:11:00Z"));
  assert.equal(v.status, "stale");
  assert.deepEqual(v.reasons, ["aged"]);
  assert.equal(v.isRefreshing, false);
  assert.equal(deriveSourceView(base, false, at("2026-10-10T16:09:59Z")).status, "available");
});

test("Toronto day rollover marks old snapshot stale", () => {
  assert.equal(getTorontoDate(new Date("2026-10-11T03:30:00Z")), "2026-10-10");
  assert.equal(deriveSourceView(base, false, at("2026-10-11T03:30:00Z")).reasons.includes("dayRollover"), false);
  const v = deriveSourceView({ ...base, lastSuccessAt: "2026-10-11T03:55:00Z" }, false, at("2026-10-11T04:01:00Z"));
  assert.equal(v.status, "stale");
  assert.ok(v.reasons.includes("dayRollover"));
});

test("starting stays starting and never-succeeded server error is unavailable", () => {
  assert.equal(deriveSourceView({ ...base, status: "starting", lastSuccessAt: null, today: null, lastNight: null }, false).status, "starting");
  const u = deriveSourceView({ ...base, status: "unavailable", lastSuccessAt: null, today: null, lastNight: null }, false);
  assert.equal(u.status, "unavailable");
  assert.equal(u.cached, false);
});
