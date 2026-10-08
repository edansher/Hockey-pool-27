// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import { strict as assert } from "node:assert";
// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import { test } from "node:test";
import type { DraftRoster, DraftRosterSelection } from "./generated/api.schemas";
import { findPlayerOwners } from "./player-owner-lookup";

const pick = (changes: Partial<DraftRosterSelection> = {}): DraftRosterSelection => ({
  round: 1, originalText: "T. Stützle", assetType: "skater", position: "F",
  reviewNote: null, confirmedName: "Tim Stützle", confirmedTeam: "OTT",
  nhlPlayerId: 1, identityCheckedAt: "2026-10-01", ...changes,
});
const roster = (selections = [pick()], id = "first"): DraftRoster => ({ id, name: id.toUpperCase(), selections });
test("search is case/accent insensitive and supports name fragments and club", () => {
  assert.equal(findPlayerOwners([roster()], "TIM STUTZLE")[0].ownerName, "FIRST");
  assert.equal(findPlayerOwners([roster()], "stutz OTT").length, 1);
  assert.equal(findPlayerOwners([roster()], "OTT stutz").length, 1);
});
test("empty or punctuation-only search does not return every roster", () => {
  assert.equal(findPlayerOwners([roster()], "").length, 0);
  assert.equal(findPlayerOwners([roster()], "??? ").length, 0);
});
test("dropped historical picks do not count as currently owned", () => {
  const history = roster([pick({ droppedAt: "2026-10-01T12:00:00Z" })]);
  const current = roster([pick({ acquiredAt: "2026-10-02T12:00:00Z" })], "new");
  assert.deepEqual(findPlayerOwners([history, current], "stutzle").map(r => r.ownerId), ["new"]);
});
test("each named goalie links to the actual goalie-slot owner", () => {
  const goalie = pick({ assetType: "goalieTeam", goalies: [
    { nhlPlayerId: 2, confirmedName: "Jeremy Swayman", confirmedTeam: "BOS", identitySource: "NHL" },
    { nhlPlayerId: 3, confirmedName: "Joonas Korpisalo", confirmedTeam: "BOS", identitySource: "NHL" },
  ] });
  assert.equal(findPlayerOwners([roster([goalie])], "korpisalo")[0].position, "G");
  assert.equal(findPlayerOwners([roster([goalie])], "BOS").length, 2);
  assert.equal(findPlayerOwners([roster([goalie, goalie])], "swayman").length, 1);
});
test("ambiguous draft names remain explicitly unverified; candidates do not claim ownership", () => {
  const unresolved = pick({ confirmedName: null, confirmedTeam: null, nhlPlayerId: null, reviewNote: "Identity pending",
    identityCandidates: [{ nhlPlayerId: 4, name: "A different person", team: "DAL", position: "F" }] });
  assert.equal(findPlayerOwners([roster([unresolved])], "stutzle")[0].verified, false);
  assert.equal(findPlayerOwners([roster([unresolved])], "different").length, 0);
});
test("all matching owners are shown, without silently resolving ownership conflicts", () => {
  assert.equal(findPlayerOwners([roster(), roster([pick()], "second")], "stutzle").length, 2);
});
test("apostrophes and hyphenated names match natural spelling", () => {
  assert.equal(findPlayerOwners([roster([pick({ confirmedName: "Ryan O’Reilly" })])], "oreilly").length, 1);
  assert.equal(findPlayerOwners([roster([pick({ confirmedName: "Jean-Gabriel Pageau" })])], "jeangabriel").length, 1);
});