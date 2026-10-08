import assert from "node:assert/strict";
import test from "node:test";
import {
  isDraftSelectionVerified,
  needsDraftSelectionConfirmation,
  sortDraftSelections,
} from "../src/draft-selection-order.ts";

const selection = (round: number, originalText: string, extra: Record<string, unknown> = {}) => ({
  round,
  originalText,
  assetType: "skater" as const,
  ...extra,
});

test("sorts skaters by the sourced last name, then first name and original round", () => {
  const picks = [
    selection(3, "McDavid", { confirmedName: "Connor McDavid", confirmedLastName: "McDavid" }),
    selection(4, "A. Lee", { confirmedName: "Mia Lee", confirmedLastName: "Lee" }),
    selection(2, "A. Lee", { confirmedName: "Adam Lee", confirmedLastName: "Lee" }),
    selection(1, "N. Hischier", { confirmedName: "Nico Hischier", confirmedLastName: "Hischier" }),
  ];

  assert.deepEqual(
    sortDraftSelections(picks).map((pick) => pick.confirmedName),
    ["Nico Hischier", "Adam Lee", "Mia Lee", "Connor McDavid"],
  );
});

test("unresolved names sort by their label after stripping leading initials without mutating input", () => {
  const picks = [
    selection(2, "C. Bergeron"),
    selection(1, "A. Matthews"),
    selection(2, "A. Lee"),
    selection(1, "B. Lee"),
  ];

  const sorted = sortDraftSelections(picks);

  assert.deepEqual(sorted.map((pick) => pick.originalText), ["C. Bergeron", "B. Lee", "A. Lee", "A. Matthews"]);
  assert.notEqual(sorted, picks);
  assert.deepEqual(picks.map((pick) => pick.round), [2, 1, 2, 1]);
});

test("keeps goalie-team assets at the end in full-name order", () => {
  const picks = [
    selection(4, "Toronto", { assetType: "goalieTeam" }),
    selection(1, "Connor Hellebuyck", { confirmedName: "Connor Hellebuyck", confirmedLastName: "Hellebuyck" }),
    selection(3, "Boston", { assetType: "goalieTeam" }),
  ];

  const sorted = sortDraftSelections(picks);

  assert.deepEqual(sorted.map((pick) => pick.originalText), ["Connor Hellebuyck", "Boston", "Toronto"]);
  assert.deepEqual(sorted.slice(1).map((pick) => pick.assetType), ["goalieTeam", "goalieTeam"]);
});

test("requires conflict-free names and teams, plus a dated snapshot for matched skaters", () => {
  const verifiedSkater = selection(1, "A. Matthews", {
    confirmedName: "Auston Matthews",
    confirmedTeam: "Toronto Maple Leafs",
    nhlPlayerId: 8479318,
    identityCheckedAt: "2026-10-01T12:00:00Z",
  });
  const conflict = {
    ...verifiedSkater,
    reviewNote: "Conflicts with the saved manual identity",
    identityCandidates: [{ nhlPlayerId: 8479318, name: "Auston Matthews", team: "Toronto Maple Leafs", position: "F" }],
  };

  assert.equal(isDraftSelectionVerified(verifiedSkater), true);
  assert.equal(needsDraftSelectionConfirmation(verifiedSkater), false);
  assert.equal(isDraftSelectionVerified(conflict), false);
  assert.equal(needsDraftSelectionConfirmation(conflict), true);
  assert.equal(isDraftSelectionVerified({ ...verifiedSkater, identityCheckedAt: null }), false);
  assert.equal(needsDraftSelectionConfirmation({ ...verifiedSkater, confirmedName: null }), true);
  assert.equal(needsDraftSelectionConfirmation({ ...verifiedSkater, confirmedTeam: null }), true);
});

test("a complete goalie-team full name does not require a player identity or separate team field", () => {
  const goalieTeam = selection(8, "Dallas", {
    assetType: "goalieTeam",
    position: "G",
    confirmedTeam: "Dallas Stars",
    reviewNote: null,
    identityCheckedAt: "2026-10-01T07:53:37.573Z",
    identitySource: "https://api-web.nhle.com/v1/standings/now",
  });

  assert.equal(isDraftSelectionVerified(goalieTeam), true);
  assert.equal(needsDraftSelectionConfirmation(goalieTeam), false);
});

test("goalie-team sorting uses the confirmed full team name rather than the board alias", () => {
  const picks = [
    selection(1, "Toronto", { assetType: "goalieTeam", confirmedTeam: "Dallas Stars" }),
    selection(2, "Boston", { assetType: "goalieTeam", confirmedTeam: "Boston Bruins" }),
  ];

  assert.deepEqual(
    sortDraftSelections(picks).map((pick) => pick.confirmedTeam),
    ["Boston Bruins", "Dallas Stars"],
  );
});

test("a retained conflicting manual name falls back to its original board label for ordering", () => {
  const picks = [
    selection(1, "Z. Larkin", {
      confirmedName: "Adam Matthews",
      confirmedTeam: "Toronto Maple Leafs",
      reviewNote: "Conflicts with the saved manual identity",
    }),
    selection(2, "A. Bergeron"),
  ];

  assert.deepEqual(
    sortDraftSelections(picks).map((pick) => pick.originalText),
    ["A. Bergeron", "Z. Larkin"],
  );
});