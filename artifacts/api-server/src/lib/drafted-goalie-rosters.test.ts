import assert from "node:assert/strict";
import test from "node:test";
import { draftRosters } from "../data/draft-rosters";
import { draftedGoalieRosterSnapshot } from "../data/drafted-goalie-rosters";
import { addConfirmedGoalies } from "./draft-roster-identity";
import { photoConfirmedGoalieIdsBySlot, photoConfirmedGoalies } from "../data/photo-confirmed-goalies";

test("all 18 original goalie slots include both NHL and screenshot-confirmed individuals without duplication", () => {
  let slotCount = 0;
  const ids: number[] = [];
  for (const owner of draftRosters) {
    const selections = addConfirmedGoalies(owner.id, owner.selections);
    assert.equal(selections.length, 20);
    for (const selection of selections) {
      const original = owner.selections.find(pick => pick.round === selection.round)!;
      assert.equal(selection.originalText, original.originalText);
      assert.equal(selection.assetType, original.assetType);
      if (selection.assetType !== "goalieTeam") {
        assert.deepEqual(selection, original);
        continue;
      }
      slotCount++;
      assert.equal(selection.goalieNamesPending, false);
      const snapshot = draftedGoalieRosterSnapshot[`${owner.id}:${selection.round}`]!;
      const expectedIds = new Set([
        ...snapshot.goalies.map(([id]) => id),
        ...photoConfirmedGoalieIdsBySlot[`${owner.id}:${selection.round}`]!,
      ]);
      assert.equal(selection.goalies?.length, expectedIds.size);
      for (const goalie of selection.goalies ?? []) {
        assert.equal(goalie.confirmedTeam, snapshot.team);
        assert.ok(goalie.identitySource.startsWith("https://api-web.nhle.com/v1/"));
        assert.ok(expectedIds.has(goalie.nhlPlayerId));
        ids.push(goalie.nhlPlayerId);
      }
    }
  }
  assert.equal(slotCount, 18);
  assert.equal(ids.length, 46);
  assert.equal(new Set(ids).size, 46);
});

test("photo-confirmed goalies retain their identity pins and are not added twice", () => {
  const joe = draftRosters.find(owner => owner.id === "joe")!;
  const goalies = addConfirmedGoalies(joe.id, joe.selections)
    .flatMap(selection => selection.goalies ?? []);
  assert.deepEqual(goalies.map(goalie => goalie.nhlPlayerId), [
    8475809, 8478406, 8481529, 8482137, 8477968, 8480356,
  ]);
  assert.ok(goalies.every(goalie => goalie.identitySource.includes("/player/")));
});

test("all nine participants have all 43 screenshot goalies pinned to verified NHL identities", () => {
  const expectedCounts: Record<string, number> = {
    cohen: 5, rob: 5, joe: 6, edan: 6, jimmy: 4,
    "drb-and-son": 5, korm: 5, nana: 4, weezbark: 3,
  };
  const ids: number[] = [];
  for (const [ownerId, expectedCount] of Object.entries(expectedCounts)) {
    const goalies = Object.entries(photoConfirmedGoalies)
      .filter(([slot]) => slot.startsWith(`${ownerId}:`))
      .flatMap(([, individuals]) => individuals);
    assert.equal(goalies.length, expectedCount, ownerId);
    ids.push(...goalies.map(goalie => goalie.nhlPlayerId));
  }
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  const korm = photoConfirmedGoalies["korm:13"]!;
  assert.equal(korm.find(goalie => goalie.nhlPlayerId === 8478007)?.confirmedTeam, "Toronto Maple Leafs");
  const drb = photoConfirmedGoalies["drb-and-son:13"]!;
  assert.equal(drb.find(goalie => goalie.nhlPlayerId === 8480022)?.confirmedTeam, "Boston Bruins");
});

test("unknown owners do not inherit someone else's goalies", () => {
  const owner = draftRosters[0]!;
  const slots = addConfirmedGoalies("unknown-owner", owner.selections)
    .filter(selection => selection.assetType === "goalieTeam");
  assert.ok(slots.every(selection => selection.goalieNamesPending === true &&
    selection.goalies?.length === 0));
});