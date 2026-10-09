import assert from "node:assert/strict";
import test from "node:test";
import { readReportSnapshots } from "./daily-report-evidence";

test("report evidence reads do not compete for limited database connections", async () => {
  let active = 0;
  const calls: string[] = [];
  const load = (name: string) => async () => {
    assert.equal(active, 0, "another evidence read still holds a connection");
    active++;
    calls.push(name);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return name;
  };
  const result = await readReportSnapshots({
    daily: load("daily"), prior: load("prior"), season: load("season"),
    rosters: load("rosters"), archive: load("archive"),
  });
  assert.deepEqual(calls, ["daily", "prior", "season", "rosters", "archive"]);
  assert.deepEqual(result, {
    daily: "daily", prior: "prior", season: "season",
    rosters: "rosters", archiveRecord: "archive",
  });
});

test("failed evidence remains a failure and does not start remaining reads", async () => {
  let laterReads = 0;
  const later = async () => { laterReads++; return "unexpected"; };
  await assert.rejects(readReportSnapshots({
    daily: async () => { throw new Error("database unavailable"); },
    prior: later, season: later, rosters: later, archive: later,
  }), /database unavailable/);
  assert.equal(laterReads, 0);
});
