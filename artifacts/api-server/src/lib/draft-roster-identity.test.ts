import assert from "node:assert/strict";
import test from "node:test";
import { draftRosters } from "../data/draft-rosters";
import {
  draftIdentitySnapshot,
  NHL_IDENTITY_CHECKED_AT,
} from "../data/draft-roster-identities";
import {
  addPhotoConfirmedGoalies,
  enrichDraftRosterSelections,
} from "./draft-roster-identity";

const enriched = draftRosters.map(owner => ({
  ...owner,
  selections: enrichDraftRosterSelections(owner.id, owner.selections),
}));
const owner = (id: string) => enriched.find(roster => roster.id === id)!;
const pick = (ownerId: string, round: number) =>
  owner(ownerId).selections.find(selection => selection.round === round)!;

test("officially verified corrections use current NHL names, teams and durable IDs", () => {
  assert.deepEqual(
    [pick("cohen", 1).confirmedName, pick("cohen", 1).confirmedTeam, pick("cohen", 1).nhlPlayerId],
    ["Connor McDavid", "Edmonton Oilers", 8478402],
  );
  assert.deepEqual(
    [pick("rob", 1).confirmedName, pick("rob", 1).nhlPlayerId],
    ["Leon Draisaitl", 8477934],
  );
  assert.deepEqual(
    [pick("korm", 10).confirmedName, pick("korm", 10).confirmedTeam],
    ["Gabriel Vilardi", "Winnipeg Jets"],
  );
  assert.deepEqual(
    [pick("edan", 9).confirmedName, pick("edan", 9).confirmedTeam],
    ["Pavel Dorofeyev", "New York Rangers"],
  );
  assert.deepEqual(
    [pick("joe", 9).confirmedName, pick("joe", 9).confirmedTeam],
    ["Beckett Sennecke", "Anaheim Ducks"],
  );
  assert.deepEqual(
    [pick("joe", 13).confirmedName, pick("joe", 13).confirmedTeam],
    ["Shea Theodore", "Vegas Golden Knights"],
  );
  assert.deepEqual(
    [pick("drb-and-son", 20).confirmedName, pick("drb-and-son", 20).confirmedTeam],
    ["Matias Maccelli", "New York Islanders"],
  );
  assert.deepEqual(
    [pick("jimmy", 14).confirmedName, pick("jimmy", 14).confirmedTeam],
    ["Seth Jarvis", "Carolina Hurricanes"],
  );
  assert.deepEqual(
    [pick("rob", 14).confirmedName, pick("rob", 14).confirmedTeam],
    ["Mathew Barzal", "New York Islanders"],
  );
  assert.deepEqual(
    [pick("weezbark", 15).confirmedName, pick("weezbark", 15).nhlPlayerId],
    ["Connor Bedard", 8484144],
  );
  assert.deepEqual(
    [pick("jimmy", 11).confirmedName, pick("jimmy", 11).confirmedTeam],
    ["Ryan O'Reilly", "Nashville Predators"],
  );

  for (const [ownerId, round, name, team, nhlPlayerId] of [
    ["weezbark", 11, "Gavin McKenna", "Toronto Maple Leafs", 8486067],
    ["cohen", 13, "Porter Martone", "Philadelphia Flyers", 8485406],
    ["cohen", 17, "Anton Frondell", "Chicago Blackhawks", 8485391],
    ["drb-and-son", 11, "Ivar Stenberg", "San Jose Sharks", 8486103],
    ["cohen", 20, "Cole Hutson", "Washington Capitals", 8484873],
  ] as const) {
    assert.deepEqual(
      [pick(ownerId, round).confirmedName, pick(ownerId, round).confirmedTeam, pick(ownerId, round).nhlPlayerId],
      [name, team, nhlPlayerId],
    );
  }

  assert.deepEqual(
    [pick("cohen", 6).confirmedName, pick("cohen", 6).confirmedTeam, pick("cohen", 6).nhlPlayerId],
    ["John Carlson", "Tampa Bay Lightning", 8474590],
  );
  assert.deepEqual(
    [pick("weezbark", 4).confirmedName, pick("weezbark", 4).confirmedTeam, pick("weezbark", 4).nhlPlayerId],
    ["Leo Carlsson", "Anaheim Ducks", 8484153],
  );
});

test("goalie-team aliases become official club names without any goalie player identity", () => {
  assert.deepEqual(
    [pick("cohen", 19).assetType, pick("cohen", 19).position, pick("cohen", 19).confirmedTeam],
    ["goalieTeam", "G", "Utah Mammoth"],
  );
  assert.deepEqual(
    [pick("rob", 10).originalText, pick("rob", 10).confirmedTeam],
    ["Minny", "Minnesota Wild"],
  );
  const goalieTeams = enriched.flatMap(roster =>
    roster.selections.filter(selection => selection.assetType === "goalieTeam"),
  );
  assert.equal(goalieTeams.length, 18);
  for (const selection of goalieTeams) {
    assert.equal(selection.confirmedName, undefined);
    assert.equal(selection.nhlPlayerId, undefined);
    assert.ok(selection.confirmedTeam);
  }
});

test("photo goalie enrichment pins Joe's six pictured individuals and keeps all club picks", () => {
  const joe = draftRosters.find(roster => roster.id === "joe")!;
  const selections = addPhotoConfirmedGoalies("joe", joe.selections);
  assert.equal(selections.length, 20);
  assert.deepEqual(
    selections.filter(selection => selection.assetType === "goalieTeam")
      .map(selection => [
        selection.round,
        selection.originalText,
        selection.goalies?.map(goalie => [goalie.confirmedName, goalie.nhlPlayerId, goalie.confirmedTeam]),
      ]),
    [
      [7, "Colorado", [
        ["Scott Wedgewood", 8475809, "Colorado Avalanche"],
        ["Mackenzie Blackwood", 8478406, "Colorado Avalanche"],
        ["Trent Miner", 8481529, "Colorado Avalanche"],
      ]],
      [18, "SJS", [
        ["Yaroslav Askarov", 8482137, "San Jose Sharks"],
        ["Alex Nedeljkovic", 8477968, "San Jose Sharks"],
        ["Kyle Keyser", 8480356, "San Jose Sharks"],
      ]],
    ],
  );
  assert.ok(selections.flatMap(selection => selection.goalies ?? []).every(goalie =>
    goalie.identitySource === `https://api-web.nhle.com/v1/player/${goalie.nhlPlayerId}/landing`,
  ));
  assert.equal(selections.find(selection => selection.round === 7)?.goalieNamesPending, false);
  assert.equal(selections.find(selection => selection.round === 18)?.goalieNamesPending, false);
  const otherGoalieSlots = draftRosters
    .filter(roster => roster.id !== "joe")
    .flatMap(roster => addPhotoConfirmedGoalies(roster.id, roster.selections))
    .filter(selection => selection.assetType === "goalieTeam");
  assert.equal(otherGoalieSlots.length, 16);
  assert.ok(otherGoalieSlots.every(selection =>
    (selection.goalies?.length ?? 0) > 0 && selection.goalieNamesPending === false,
  ));
  assert.deepEqual(
    selections.filter(selection => selection.assetType === "goalieTeam")
      .map(selection => selection.originalText),
    ["Colorado", "SJS"],
  );
});

test("goalie-only names are excluded from skater matches while unique skater matches resolve", () => {
  assert.deepEqual(
    [pick("rob", 7).confirmedName, pick("rob", 7).nhlPlayerId],
    ["Filip Forsberg", 8476887],
  );
  assert.deepEqual(
    [pick("weezbark", 6).confirmedName, pick("weezbark", 6).nhlPlayerId],
    ["Logan Cooley", 8483431],
  );
  assert.deepEqual(
    [pick("jimmy", 4).confirmedName, pick("jimmy", 4).nhlPlayerId],
    ["Tage Thompson", 8479420],
  );
});

test("creator photo-confirmed surnames resolve to the matching NHL candidate identities", () => {
  const expected = [
    ["cohen", 18, "Pettersson", "Elias Pettersson", "Vancouver Canucks", 8480012],
    ["edan", 2, "Johnston", "Wyatt Johnston", "Dallas Stars", 8482740],
    ["edan", 8, "Smith", "Will Smith", "San Jose Sharks", 8484227],
    ["edan", 14, "Miller", "J.T. Miller", "New York Rangers", 8476468],
    ["joe", 11, "Wilson", "Tom Wilson", "Washington Capitals", 8476880],
    ["drb-and-son", 16, "Eklund", "William Eklund", "Ottawa Senators", 8482667],
    ["nana", 13, "Geekie", "Morgan Geekie", "Boston Bruins", 8479987],
    ["jimmy", 1, "Robertson", "Jason Robertson", "Dallas Stars", 8480027],
  ] as const;

  for (const [ownerId, round, originalText, name, team, nhlPlayerId] of expected) {
    const selection = pick(ownerId, round);
    assert.equal(selection.originalText, originalText);
    assert.deepEqual(
      [selection.confirmedName, selection.confirmedTeam, selection.nhlPlayerId],
      [name, team, nhlPlayerId],
    );
    assert.equal(selection.confirmedLastName, originalText);
    assert.equal(selection.identityCandidates, undefined);
    assert.equal(selection.reviewNote, null);
    assert.equal(selection.identityCheckedAt, NHL_IDENTITY_CHECKED_AT);
    assert.ok(selection.identitySource?.includes(`/player/${nhlPlayerId}/landing`));
    assert.ok(selection.identitySource?.includes("https://search.d3.nhle.com/api/v1/search/player"));
  }
  assert.equal(
    [...draftIdentitySnapshot.values()].filter(entry => entry.kind === "ambiguous").length,
    0,
  );
});

test("enrichment keeps all original pick fields, all 180 counts and stored order", () => {
  assert.equal(enriched.length, 9);
  assert.equal(enriched.reduce((sum, roster) => sum + roster.selections.length, 0), 180);
  assert.equal(enriched.reduce(
    (sum, roster) => sum + roster.selections.filter(selection => selection.assetType === "skater").length,
    0,
  ), 162);
  assert.equal(enriched.reduce(
    (sum, roster) => sum + roster.selections.filter(selection => selection.assetType === "goalieTeam").length,
    0,
  ), 18);
  assert.equal(enriched.reduce(
    (sum, roster) => sum + roster.selections.filter(
      selection => selection.assetType === "skater" && selection.nhlPlayerId != null,
    ).length,
    0,
  ), 162);
  assert.equal(enriched.reduce(
    (sum, roster) => sum + roster.selections.filter(
      selection => selection.assetType === "skater" && selection.nhlPlayerId == null,
    ).length,
    0,
  ), 0);
  for (const original of draftRosters) {
    const next = owner(original.id);
    assert.equal(next.selections.length, 20);
    assert.deepEqual(
      next.selections.map(({ round, originalText, assetType, position }) =>
        [round, originalText, assetType, position],
      ),
      original.selections.map(({ round, originalText, assetType, position }) =>
        [round, originalText, assetType, position],
      ),
    );
  }
});

test("unknown original labels stay unguessed and are not marked as checked", () => {
  const unknown = {
    round: 21,
    originalText: "Unknown Prospect",
    assetType: "skater" as const,
    position: "F" as const,
    reviewNote: null,
  };
  const [selection] = enrichDraftRosterSelections("unlisted-owner", [unknown]);
  assert.equal(selection?.confirmedName, undefined);
  assert.equal(selection?.confirmedTeam, undefined);
  assert.equal(selection?.nhlPlayerId, undefined);
  assert.equal(selection?.identityCheckedAt, undefined);
  assert.match(selection?.reviewNote ?? "", /no player name or team was guessed/);
});

test("identity metadata is dated, auditable, and idempotent", () => {
  for (const roster of enriched) {
    for (const selection of roster.selections) {
      assert.equal(selection.identityCheckedAt, NHL_IDENTITY_CHECKED_AT);
      assert.ok(selection.identitySource?.startsWith("https://"));
    }
  }
  for (const original of draftRosters) {
    assert.deepEqual(
      enrichDraftRosterSelections(
        original.id,
        enrichDraftRosterSelections(original.id, original.selections),
      ),
      enrichDraftRosterSelections(original.id, original.selections),
    );
  }
});

test("manual identity edits that conflict with the snapshot are protected and flagged", () => {
  const pinned = draftRosters.find(roster => roster.id === "cohen")!.selections[5]!;
  const manual = {
    ...pinned,
    confirmedName: "Creator-Corrected Carlson",
    confirmedLastName: "Carlson",
    confirmedTeam: "Manual team correction",
    nhlPlayerId: null,
  };
  const first = enrichDraftRosterSelections("cohen", [manual])[0]!;
  const second = enrichDraftRosterSelections("cohen", [first])[0]!;

  assert.equal(first.confirmedName, "Creator-Corrected Carlson");
  assert.equal(first.confirmedTeam, "Manual team correction");
  assert.equal(first.nhlPlayerId, null);
  assert.equal(first.confirmedLastName, undefined);
  assert.equal(first.identityCheckedAt, undefined);
  assert.equal(first.identitySource, undefined);
  assert.equal(first.identityCandidates?.[0]?.name, "John Carlson");
  assert.match(first.reviewNote ?? "", /conflicts with the official match/);
  assert.deepEqual(second, first);
});