// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally not a dependency of this client library.
import test from "node:test";
import type { DraftRoster, PoolScoringSnapshot } from "./generated/api.schemas";
import { buildPoolLeaders, draftSelectionScoringRows, poolLeaderId } from "./pool-leaders";

function selection(
  round: number,
  changes: Partial<DraftRoster["selections"][number]> = {},
): DraftRoster["selections"][number] {
  return {
    round,
    originalText: `Original ${round}`,
    assetType: "skater",
    position: "F",
    reviewNote: null,
    confirmedName: `Player ${round}`,
    confirmedTeam: "AAA",
    nhlPlayerId: round,
    identityCheckedAt: "2026-07-01T00:00:00.000Z",
    ...changes,
  };
}

function roster(id: string, name: string, ...selections: DraftRoster["selections"]): DraftRoster {
  return { id, name, selections };
}

function snapshot(
  rows: PoolScoringSnapshot["rows"],
  status: PoolScoringSnapshot["status"] = "available",
): PoolScoringSnapshot {
  return {
    status,
    reason: null,
    asOf: null,
    season: 20262027,
    coverageThroughDate: null,
    rows,
  };
}

function scoringRow(
  ownerId: string,
  round: number,
  changes: Partial<PoolScoringSnapshot["rows"][number]> = {},
): PoolScoringSnapshot["rows"][number] {
  return {
    ownerId,
    round,
    assetType: "skater",
    nhlPlayerId: null,
    goals: 0,
    assists: 0,
    powerPlayGoals: 0,
    shortHandedGoals: 0,
    overtimeGoals: 0,
    poolPoints: 0,
    gamesPlayed: 0,
    wins: null,
    shutouts: null,
    ...changes,
  };
}

test("top 25 selects the highest known pool points from the full fetched roster, not draft order", () => {
  const picks = Array.from({ length: 35 }, (_, i) => selection(i + 1));
  const owners = [roster("owner", "Owner", ...picks)];
  const rows = picks.map(pick => scoringRow("owner", pick.round, {
    nhlPlayerId: pick.nhlPlayerId,
    poolPoints: [2, 13, 27].includes(pick.round) ? null : pick.round * 7 % 37,
  }));
  const current = snapshot(rows);
  const top = buildPoolLeaders(owners, current).filter(player => player.poolPoints !== null).slice(0, 25);
  const expected = rows.map(row => row.poolPoints).filter((points): points is number => points !== null).sort((a, b) => b - a).slice(0, 25);
  assert.equal(top.length, 25);
  assert.deepEqual(top.map(player => player.poolPoints), expected);
  assert.equal(top[0]!.round, 21);
  const updated = structuredClone(current);
  updated.rows[34]!.poolPoints = 99;
  const refreshed = buildPoolLeaders(owners, updated).filter(player => player.poolPoints !== null).slice(0, 25);
  assert.equal(refreshed.length, 25);
  assert.equal(refreshed[0]!.round, 35);
  assert.equal(refreshed[0]!.poolPoints, 99);
  assert.notEqual(current.rows[34]!.poolPoints, 99);
});

test("sorts by official points descending with zero ahead of null and deterministic name ties", () => {
  const rosters = [
    roster("owner-1", "Owner", selection(1, { confirmedName: "Zed Zero" }), selection(2, { confirmedName: "Amy Alpha" }), selection(3)),
  ];
  const leaders = buildPoolLeaders(rosters, snapshot([
    scoringRow("owner-1", 1, { poolPoints: 0 }),
    scoringRow("owner-1", 2, { poolPoints: 0 }),
    scoringRow("owner-1", 3, { poolPoints: null }),
  ]));

  assert.deepEqual(leaders.map(({ name, poolPoints }) => [name, poolPoints]), [
    ["Amy Alpha", 0],
    ["Zed Zero", 0],
    ["Player 3", null],
  ]);
});

test("never scores a legacy club entry when individual goalie names are pending", () => {
  const goalieTeamSelection = selection(1, {
    assetType: "goalieTeam",
    position: "G",
    originalText: "Old club label",
    confirmedName: "Must not be used",
    confirmedTeam: "Seattle Kraken",
    nhlPlayerId: null,
  });
  const leaders = buildPoolLeaders(
    [roster("goalies", "Goalie owner", goalieTeamSelection)],
    snapshot([
      scoringRow("goalies", 1, {
        assetType: "goalieTeam",
        nhlPlayerId: null,
        poolPoints: 7,
        gamesPlayed: 4,
        wins: 3,
        shutouts: 1,
      }),
    ]),
  );

  assert.deepEqual(leaders[0], {
    ownerId: "goalies",
    ownerName: "Goalie owner",
    round: 1,
    assetType: "goalie",
    position: "G",
    nhlPlayerId: null,
    name: "Goalie names pending",
    team: "Seattle Kraken",
    goals: null,
    powerPlayGoals: null,
    shortHandedGoals: null,
    assists: null,
    overtimeGoals: null,
    poolPoints: null,
    gamesPlayed: null,
    wins: null,
    shutouts: null,
  });
});

test("joins both photo-confirmed goalies by individual identity without club double counting", () => {
  const goalieSlot = selection(7, {
    assetType: "goalieTeam", position: "G", nhlPlayerId: null,
    confirmedTeam: "Colorado Avalanche",
    goalies: [
      { nhlPlayerId: 10, confirmedName: "Mackenzie Blackwood", confirmedTeam: "COL", identitySource: "Uploaded photo" },
      { nhlPlayerId: 11, confirmedName: "Scott Wedgewood", confirmedTeam: "COL", identitySource: "Uploaded photo" },
    ],
    goalieNamesPending: false,
  });
  const rows = [
    scoringRow("joe", 7, { assetType: "goalie", nhlPlayerId: 10, goals: 1, assists: 1, poolPoints: 13, wins: 0, shutouts: 0 }),
    scoringRow("joe", 7, { assetType: "goalie", nhlPlayerId: 11, goals: 0, assists: 1, poolPoints: 3, wins: 0, shutouts: 0 }),
    scoringRow("other", 7, { assetType: "goalie", nhlPlayerId: 11, poolPoints: 99 }),
    scoringRow("joe", 7, { assetType: "goalieTeam", poolPoints: 16 }),
  ];
  const leaders = buildPoolLeaders([roster("joe", "Joe", goalieSlot)], snapshot(rows));
  assert.equal(leaders.length, 2);
  assert.deepEqual(leaders.map(l => [l.name, l.goals, l.assists, l.poolPoints]), [
    ["Mackenzie Blackwood", 1, 1, 13], ["Scott Wedgewood", 0, 1, 3],
  ]);
  assert.deepEqual(leaders.map(poolLeaderId), ["joe:7:10", "joe:7:11"]);
  assert.ok(leaders.every(l => l.assetType === "goalie" && l.powerPlayGoals === null));
  assert.equal(draftSelectionScoringRows(goalieSlot, rows, "joe").reduce((n, r) => n + (r.poolPoints ?? 0), 0), 16);
});

test("an unscored backup stays unknown instead of inheriting the starter or club points", () => {
  const slot = selection(7, {
    assetType: "goalieTeam", position: "G", nhlPlayerId: null,
    goalies: [
      { nhlPlayerId: 10, confirmedName: "Starter", confirmedTeam: "COL", identitySource: "Photo" },
      { nhlPlayerId: 11, confirmedName: "Backup", confirmedTeam: "COL", identitySource: "Photo" },
    ],
  });
  const leaders = buildPoolLeaders([roster("joe", "Joe", slot)], snapshot([
    scoringRow("joe", 7, { assetType: "goalie", nhlPlayerId: 10, poolPoints: 5, wins: 1, shutouts: 1 }),
    scoringRow("joe", 7, { assetType: "goalieTeam", poolPoints: 5 }),
  ]));
  assert.equal(leaders.find(l => l.nhlPlayerId === 11)?.poolPoints, null);
  assert.equal(leaders.find(l => l.nhlPlayerId === 11)?.wins, null);
});

test("keeps 180 original slots while expanding four named goalies and preserving 16 pending slots", () => {
  const rosters = Array.from({ length: 9 }, (_, ownerIndex) =>
    roster(`owner-${ownerIndex}`, `Owner ${ownerIndex}`, ...Array.from({ length: 20 }, (_, i) => selection(i + 1, i < 2 ? {
      assetType: "goalieTeam", position: "G", nhlPlayerId: null,
      goalies: ownerIndex === 0 ? [0, 1].map(offset => ({
        nhlPlayerId: 100 + i * 2 + offset, confirmedName: `Goalie ${i}-${offset}`,
        confirmedTeam: "COL", identitySource: "Photo",
      })) : [],
      goalieNamesPending: ownerIndex !== 0,
    } : {}))),
  );
  const leaders = buildPoolLeaders(rosters, snapshot([], "partial"));
  assert.equal(rosters.reduce((n, r) => n + r.selections.length, 0), 180);
  assert.equal(leaders.filter(l => l.assetType === "skater").length, 162);
  assert.equal(leaders.filter(l => l.assetType === "goalie" && l.nhlPlayerId !== null).length, 4);
  assert.equal(leaders.filter(l => l.assetType === "goalie" && l.nhlPlayerId === null).length, 16);
  assert.equal(new Set(leaders.map(poolLeaderId)).size, 182);
});

test("keeps same NHL player IDs for different owners as separate draft assets", () => {
  const sharedId = 8478402;
  const rosters = [
    roster("owner-a", "Alex", selection(4, { nhlPlayerId: sharedId, confirmedName: "Connor McDavid" })),
    roster("owner-b", "Blair", selection(4, { nhlPlayerId: sharedId, confirmedName: "Connor McDavid" })),
  ];
  const leaders = buildPoolLeaders(rosters, snapshot([
    scoringRow("owner-a", 4, { poolPoints: 10 }),
    scoringRow("owner-b", 4, { poolPoints: 12 }),
  ]));

  assert.equal(leaders.length, 2);
  assert.deepEqual(leaders.map(({ ownerId, nhlPlayerId, poolPoints }) => [ownerId, nhlPlayerId, poolPoints]), [
    ["owner-b", sharedId, 12],
    ["owner-a", sharedId, 10],
  ]);
});

test("keeps all 180 selections in a nine-owner, twenty-round pool", () => {
  const rosters = Array.from({ length: 9 }, (_, ownerIndex) =>
    roster(
      `owner-${ownerIndex + 1}`,
      `Owner ${ownerIndex + 1}`,
      ...Array.from({ length: 20 }, (_, roundIndex) => selection(roundIndex + 1)),
    ),
  );

  assert.equal(buildPoolLeaders(rosters, snapshot([])).length, 180);
});

test("participant order updates with fresh scores, interleaves goalies, and preserves draft ownership", () => {
  const picks = [
    selection(1, { confirmedName: "Skater One" }),
    selection(2, {
      assetType: "goalieTeam", position: "G", originalText: "BUF",
      goalies: [
        { nhlPlayerId: 20, confirmedName: "Goalie Starter", confirmedTeam: "Buffalo Sabres", identitySource: "test" },
        { nhlPlayerId: 21, confirmedName: "Goalie Backup", confirmedTeam: "Buffalo Sabres", identitySource: "test" },
      ],
    }),
    selection(3, { confirmedName: "Skater Two" }),
    selection(4, { confirmedName: "Skater Zero" }),
    selection(5, { confirmedName: "Skater Pending" }),
  ];
  const owners = [roster("owner", "Owner", ...picks)];
  const original = structuredClone(owners);
  const initial = snapshot([
    scoringRow("owner", 1, { nhlPlayerId: 1, poolPoints: 6 }),
    scoringRow("owner", 2, { assetType: "goalie", nhlPlayerId: 20, poolPoints: 10 }),
    scoringRow("owner", 3, { nhlPlayerId: 3, poolPoints: 4 }),
    scoringRow("owner", 4, { nhlPlayerId: 4, poolPoints: 0 }),
  ], "partial");
  const firstOrder = buildPoolLeaders(owners, initial);
  assert.deepEqual(firstOrder.map(player => player.poolPoints), [10, 6, 4, 0, null, null]);
  assert.equal(firstOrder[0]!.nhlPlayerId, 20);
  const updated = structuredClone(initial);
  updated.rows.find(row => row.nhlPlayerId === 3)!.poolPoints = 12;
  const secondOrder = buildPoolLeaders(owners, updated);
  assert.equal(secondOrder[0]!.nhlPlayerId, 3);
  assert.deepEqual(secondOrder.map(player => player.poolPoints), [12, 10, 6, 0, null, null]);
  assert.equal(new Set(secondOrder.map(poolLeaderId)).size, secondOrder.length);
  assert.deepEqual(owners, original);
  assert.equal(initial.rows.find(row => row.nhlPlayerId === 3)!.poolPoints, 4);
  assert.equal(buildPoolLeaders(owners).length, 6);
  assert.ok(buildPoolLeaders(owners).every(player => player.poolPoints === null));
});

test("retains every roster selection and uses original text with null stats when unverified or unscored", () => {
  const unverified = selection(1, {
    originalText: "Unresolved draft text",
    confirmedName: "Unconfirmed candidate",
    confirmedTeam: "Unconfirmed club",
    nhlPlayerId: 0,
    identityCheckedAt: null,
    reviewNote: "Needs confirmation",
  });
  const unverifiedMissing = selection(2, {
    originalText: "Unresolved pick without a score row",
    confirmedName: "Unconfirmed second candidate",
    confirmedTeam: "Unconfirmed second club",
    identityCheckedAt: null,
    reviewNote: "Needs confirmation",
  });
  const rosters = [
    roster("owner-a", "Alex", unverified, unverifiedMissing),
    roster("owner-b", "Blair", selection(1)),
  ];
  const leaders = buildPoolLeaders(rosters, snapshot([
    scoringRow("owner-a", 1, { poolPoints: 5 }),
  ], "partial"));
  const unresolved = leaders.find(({ ownerId, round }) => ownerId === "owner-a" && round === 1)!;
  const missing = leaders.find(({ ownerId, round }) => ownerId === "owner-a" && round === 2)!;

  assert.equal(leaders.length, 3);
  assert.equal(unresolved.name, "Unresolved draft text");
  assert.equal(unresolved.team, null);
  assert.equal(unresolved.nhlPlayerId, null);
  assert.equal(unresolved.poolPoints, 5);
  assert.equal(missing.name, "Unresolved pick without a score row");
  assert.equal(missing.team, null);
  assert.equal(missing.nhlPlayerId, null);
  assert.equal(missing.poolPoints, null);
  assert.equal(missing.goals, null);
  assert.equal(missing.gamesPlayed, null);
});