import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_FACEOFF_TEAMS_URL,
  getDailyFaceoffLineUrl,
  NHL_LINE_TEAMS,
} from "../src/nhl-lines";

test("the Lines directory contains every current NHL club exactly once", () => {
  assert.equal(NHL_LINE_TEAMS.length, 32);
  assert.equal(new Set(NHL_LINE_TEAMS.map(team => team.abbreviation)).size, 32);
  assert.equal(new Set(NHL_LINE_TEAMS.map(team => team.slug)).size, 32);
  assert.equal(new Set(NHL_LINE_TEAMS.map(getDailyFaceoffLineUrl)).size, 32);
  assert.ok(NHL_LINE_TEAMS.some(team => team.abbreviation === "UTA" &&
    team.name === "Utah Mammoth" && team.slug === "utah-mammoth"));
});

test("team links open the live Daily Faceoff line-combinations page", () => {
  assert.equal(DAILY_FACEOFF_TEAMS_URL, "https://www.dailyfaceoff.com/teams");
  for (const team of NHL_LINE_TEAMS) {
    const url = new URL(getDailyFaceoffLineUrl(team));
    assert.equal(url.origin, "https://www.dailyfaceoff.com");
    assert.equal(url.pathname, `/teams/${team.slug}/line-combinations`);
    assert.equal(url.search, "");
    assert.match(team.slug, /^[a-z]+(?:-[a-z]+)*$/);
  }
  const toronto = NHL_LINE_TEAMS.find(team => team.abbreviation === "TOR")!;
  assert.equal(getDailyFaceoffLineUrl(toronto),
    "https://www.dailyfaceoff.com/teams/toronto-maple-leafs/line-combinations");
});