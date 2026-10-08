import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleReport, previousCalendarDate, reportFingerprint, torontoReportClock,
  validateWriting, verifyReportInput, type VerifiedReportInput,
} from "./daily-report-builder";

function fixture(): VerifiedReportInput {
  const ids = ["alpha", "bravo", "charlie"];
  const points = [5, 5, 0];
  const rosters = ids.map((id, i) => ({
    id, name: id, selections: [{
      round: 1, originalText: `Player ${i}`, assetType: "skater" as const, position: "F" as const,
      reviewNote: null, nhlPlayerId: i + 1, confirmedName: `Player ${i}`, confirmedTeam: "TOR",
    }],
  }));
  const scoring = ids.slice(0, 2).map((id, i) => ({
    ownerId: id, ownerName: id, playerId: String(i + 1), playerName: `Player ${i}`, team: "TOR",
    goals: 1, assists: 0, powerPlayGoals: 0, shortHandedGoals: 1, overtimeGoals: 0,
    hatTrick: false, poolPoints: 5,
    scoringBreakdown: [{ label: "SHG", count: 1, points: 5, note: null }],
  }));
  const owners = ids.map((id, i) => ({
    ownerId: id, ownerName: id, dailyPoints: points[i], seasonPoints: points[i],
    rank: i < 2 ? 1 : 3, previousRank: 1, narrative: "", scoring: scoring.filter(s => s.ownerId === id),
  }));
  return {
    reportDate: "2026-10-02",
    daily: { date: "2026-10-01", status: "final", summary: "verified", owners, scoring },
    prior: { date: "2026-09-30", status: "final", summary: "verified", scoring: [],
      owners: owners.map(o => ({ ...o, dailyPoints: 0, seasonPoints: 0, rank: 1, scoring: [] })) },
    season: {
      status: "available", reason: null, asOf: "2026-10-02T11:52:00Z", season: 20262027,
      coverageThroughDate: "2026-10-01",
      rows: ids.map((id, i) => ({
        ownerId: id, round: 1, assetType: "skater", nhlPlayerId: i + 1, goals: i < 2 ? 1 : 0,
        assists: 0, powerPlayGoals: 0, shortHandedGoals: i < 2 ? 1 : 0, overtimeGoals: 0,
        poolPoints: points[i], gamesPlayed: 1, wins: null, shutouts: null,
      })),
    }, rosters, activePlayers: new Map(ids.map(id => [id, 1])),
  };
}
const writing = () => ({
  summary: "Special-goal scoring shaped the current pool standings.",
  raceNarrative: "The leaders are tied and the next participant remains in pursuit.",
  owners: ["alpha", "bravo", "charlie"].map(ownerId => ({
    ownerId, narrative: "The verified scoring shows this participant's result without inventing facts.",
  })),
});

test("Toronto publication uses calendar days and handles both DST offsets", () => {
  for (const [before, at] of [
    ["2026-10-02T11:59:59Z", "2026-10-02T12:00:00Z"],
    ["2026-11-02T12:59:59Z", "2026-11-02T13:00:00Z"],
  ]) {
    assert.equal(torontoReportClock(new Date(before)).ready, false);
    assert.equal(torontoReportClock(new Date(at)).ready, true);
  }
  assert.equal(torontoReportClock(new Date("2026-10-02T03:00:00Z")).date, "2026-10-01");
  assert.equal(previousCalendarDate("2027-01-01"), "2026-12-31");
});

test("complete authoritative evidence passes without replacing the scoring engine", () => {
  assert.doesNotThrow(() => verifyReportInput(fixture()));
});

test("pending, unavailable, incomplete and mismatched scores cannot publish", () => {
  for (const change of [
    (x: VerifiedReportInput) => { x.daily.status = "pending"; },
    (x: VerifiedReportInput) => { x.season.status = "unavailable"; },
    (x: VerifiedReportInput) => { x.daily.owners.pop(); },
    (x: VerifiedReportInput) => { x.daily.owners[0].seasonPoints++; },
    (x: VerifiedReportInput) => { x.daily.owners[0].dailyPoints++; },
    (x: VerifiedReportInput) => { x.daily.owners[0].rank++; },
    (x: VerifiedReportInput) => { x.season.coverageThroughDate = null; },
    (x: VerifiedReportInput) => { x.reportDate = "2026-10-03"; },
    (x: VerifiedReportInput) => { x.season.rows[0].poolPoints = null; },
  ]) {
    const input = fixture(); change(input);
    assert.throws(() => verifyReportInput(input));
  }
});

test("awards include all ties, zero-point owners stay in report, gaps use stored totals", () => {
  const input = fixture();
  const before = structuredClone(input.daily);
  const report = assembleReport(input, writing(), "2026-10-02T12:01:00Z");
  assert.deepEqual(report.participantsOfNight, ["alpha", "bravo"]);
  assert.equal(report.playersOfNight.length, 2);
  assert.equal(report.owners.length, 3);
  assert.equal(report.owners[2].dailyPoints, 0);
  assert.equal(report.owners[2].gapFromFirst, 5);
  assert.equal(report.owners[0].tied, true);
  assert.equal(report.owners[2].movement, -2);
  assert.equal(report.topThreeGap, 5);
  assert.equal(report.topFiveGap, null);
  assert.equal(report.closestRaces[0].gap, 0);
  assert.deepEqual(input.daily, before);
});

test("zero-scoring days have no award rather than inventing a winning performance", () => {
  const input = fixture();
  input.season.rows.forEach(r => r.poolPoints = 0);
  input.daily.owners.forEach(o => { o.dailyPoints = 0; o.seasonPoints = 0; o.rank = 1; o.scoring = []; });
  input.daily.scoring = [];
  const report = assembleReport(input, writing(), "2026-10-02T12:01:00Z");
  assert.deepEqual(report.playersOfNight, []);
  assert.deepEqual(report.participantsOfNight, []);
});

test("AI cannot inject scores, gap trends, missing participants or duplicate identities", () => {
  const ids = ["alpha", "bravo", "charlie"];
  assert.doesNotThrow(() => validateWriting(writing(), ids));
  const numeric = writing(); numeric.summary = "The leader scored 999 points and won the league.";
  assert.throws(() => validateWriting(numeric, ids));
  const trend = writing(); trend.summary = "The leader's margin narrowed during the previous night.";
  assert.throws(() => validateWriting(trend, ids));
  const missing = writing(); missing.owners.pop();
  assert.throws(() => validateWriting(missing, ids));
  const duplicate = writing(); duplicate.owners[1].ownerId = "alpha";
  assert.throws(() => validateWriting(duplicate, ids));
});

test("refresh time changes are not corrections; score changes are", () => {
  const input = fixture();
  const hash = reportFingerprint(input);
  input.season.asOf = "2026-10-02T12:05:00Z";
  assert.equal(reportFingerprint(input), hash);
  input.season.rows[0].poolPoints = input.season.rows[0].poolPoints! + 1;
  assert.notEqual(reportFingerprint(input), hash);
});