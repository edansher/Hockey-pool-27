import assert from "node:assert/strict";
import test from "node:test";
import { draftRosters } from "../data/draft-rosters";
import {
  LIVE_PROVISIONAL_REASON,
  type DailyPoolScoringSnapshot,
  type PoolScoringSnapshot,
} from "./pool-scoring-service";
import {
  completeRosterScoringTotals,
  pendingStandings,
  scheduledPlayerCounts,
  scoredStandings,
} from "./pool-standings";
import type { NhlDayFeed } from "./nhl-source-parser";

test("pending standings preserve every imported owner without inventing scores or rankings", () => {
  const snapshot = pendingStandings(draftRosters, null);
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.asOf, null);
  assert.equal(snapshot.date, null);
  assert.equal(snapshot.rows.length, 9);
  assert.deepEqual(
    snapshot.rows.map(row => row.id).sort(),
    draftRosters.map(owner => owner.id).sort(),
  );
  for (const row of snapshot.rows) {
    for (const key of [
      "rank", "previousRank", "rankMovement", "seasonPoints", "yesterdayPoints",
      "livePoints", "playing", "gamesPlayed", "pointsPerGame", "transactionsUsed",
    ] as const) {
      assert.equal(row[key], null);
    }
    assert.equal(row.name, draftRosters.find(owner => owner.id === row.id)?.name);
  }
});

test("historical dates do not masquerade as scored snapshots", () => {
  const snapshot = pendingStandings(draftRosters, "2026-10-01");
  assert.equal(snapshot.date, "2026-10-01");
  assert.equal(snapshot.status, "unavailable");
  assert.match(snapshot.reason, /Historical standings are pending/);
});

test("ranked standings sort by rank and alphabetically within ties; pending rows stay alphabetical", () => {
  const totals: Record<string, number> = {
    cohen: 0,
    weezbark: 9,
    rob: 1,
    korm: 2,
    edan: 0,
    joe: 3,
    "drb-and-son": 4,
    nana: 6,
    jimmy: 3,
  };
  const snapshot: PoolScoringSnapshot = {
    status: "available",
    reason: null,
    asOf: null,
    season: 20262027,
    coverageThroughDate: "2026-10-01",
    rows: draftRosters.flatMap(owner => owner.selections.map((_, index) => ({
      ownerId: owner.id,
      round: index + 1,
      assetType: "skater",
      nhlPlayerId: index + 1,
      goals: 0,
      assists: 0,
      powerPlayGoals: 0,
      shortHandedGoals: 0,
      overtimeGoals: 0,
      poolPoints: index === 0 ? totals[owner.id]! : 0,
      gamesPlayed: 0,
      wins: null,
      shutouts: null,
    }))),
  };
  const yesterday: DailyPoolScoringSnapshot = {
    date: "2026-09-30",
    status: "final",
    summary: "verified",
    scoring: [],
    owners: draftRosters.map((owner, index) => ({
      ownerId: owner.id,
      ownerName: owner.name,
      dailyPoints: 0,
      seasonPoints: totals[owner.id]!,
      rank: index + 1,
      previousRank: null,
      narrative: "",
      scoring: [],
    })),
  };
  const today: DailyPoolScoringSnapshot = {
    date: "2026-10-01",
    status: "final",
    summary: "verified",
    scoring: [],
    owners: [],
  };

  const ranked = scoredStandings(draftRosters, snapshot, yesterday, today, null);
  assert.deepEqual(
    ranked.rows.map(row => row.id),
    ["weezbark", "nana", "drb-and-son", "jimmy", "joe", "korm", "rob", "cohen", "edan"],
  );
  assert.equal(ranked.rows[3]?.rank, ranked.rows[4]?.rank);
  assert.ok(ranked.rows.every(row => row.yesterdayPoints === 0));
  const missingDailyOwner = scoredStandings(
    draftRosters,
    snapshot,
    { ...yesterday, owners: yesterday.owners.filter(owner => owner.ownerId !== "cohen") },
    today,
    null,
  );
  assert.equal(missingDailyOwner.rows.find(row => row.id === "cohen")?.yesterdayPoints, null);

  const live = scoredStandings(
    draftRosters,
    { ...snapshot, status: "partial", reason: LIVE_PROVISIONAL_REASON },
    yesterday,
    { ...today, status: "pending", summary: LIVE_PROVISIONAL_REASON },
    null,
  );
  assert.equal(live.status, "partial");
  assert.equal(live.rows[0]?.id, "weezbark");
  assert.equal(live.rows[0]?.rank, 1);
  assert.equal(live.rows[0]?.seasonPoints, 9);

  const currentWithUnknownGoalieStats = {
    ...snapshot,
    status: "partial" as const,
    reason: null,
    rows: snapshot.rows.map(row =>
      row.ownerId === "weezbark" && row.round === 1
        ? { ...row, poolPoints: null, wins: null }
        : row,
    ),
  };
  const unrankedCurrent = scoredStandings(
    draftRosters,
    currentWithUnknownGoalieStats,
    yesterday,
    { ...today, status: "pending", summary: "Today's games are still in progress." },
    null,
  );
  assert.ok(unrankedCurrent.rows.every(row => row.rank === null && row.seasonPoints === null));
  const confirmedBaseline = scoredStandings(
    draftRosters,
    snapshot,
    yesterday,
    { ...today, status: "pending", summary: "Today's games are still in progress." },
    "2026-10-01",
    true,
  );
  assert.equal(currentWithUnknownGoalieStats.rows.find(row => row.ownerId === "weezbark")?.poolPoints, null);
  assert.equal(confirmedBaseline.status, "partial");
  assert.equal(confirmedBaseline.date, "2026-10-01");
  assert.equal(confirmedBaseline.rows[0]?.id, "weezbark");
  assert.equal(confirmedBaseline.rows[0]?.rank, 1);
  assert.equal(confirmedBaseline.rows[0]?.seasonPoints, 9);
  assert.equal(confirmedBaseline.rows[0]?.livePoints, 0);
  assert.equal(confirmedBaseline.rows[0]?.yesterdayPoints, 0);
  assert.match(confirmedBaseline.reason ?? "", /^Live provisional/);
  assert.match(confirmedBaseline.reason ?? "", /baseline through 2026-09-30/);
  assert.match(confirmedBaseline.reason ?? "", /pending points are not included/);

  const incompleteBaseline = scoredStandings(
    draftRosters,
    { ...snapshot, status: "partial", reason: "Historical archive coverage is incomplete.", rows: currentWithUnknownGoalieStats.rows },
    yesterday,
    today,
    "2026-09-30",
    true,
  );
  assert.ok(incompleteBaseline.rows.every(row => row.rank === null && row.seasonPoints === null));

  const explicitHistorical = scoredStandings(
    draftRosters,
    { ...snapshot, status: "partial", reason: "Historical archive coverage is incomplete.", rows: currentWithUnknownGoalieStats.rows },
    yesterday,
    today,
    "2026-09-30",
  );
  assert.equal(explicitHistorical.date, "2026-09-30");
  assert.ok(explicitHistorical.rows.every(row => row.rank === null && row.seasonPoints === null));

  const staleKnown = scoredStandings(
    draftRosters,
    { ...snapshot, status: "stale", reason: "Refresh failed; last-good values retained." },
    yesterday,
    today,
    null,
  );
  assert.equal(staleKnown.status, "partial");
  assert.equal(staleKnown.rows[0]?.id, "weezbark");
  assert.equal(staleKnown.rows[0]?.rank, 1);
  assert.equal(staleKnown.rows[0]?.seasonPoints, 9);
  assert.match(staleKnown.reason ?? "", /last-good values retained/);

  const staleIncomplete = scoredStandings(
    draftRosters,
    {
      ...snapshot,
      status: "stale",
      reason: "Refresh failed.",
      rows: snapshot.rows.map(row =>
        row.ownerId === "weezbark" && row.round === 1
          ? { ...row, poolPoints: null }
          : row,
      ),
    },
    yesterday,
    today,
    null,
  );
  assert.ok(staleIncomplete.rows.every(row => row.rank === null && row.seasonPoints === null));

  const pending = scoredStandings(
    draftRosters,
    { ...snapshot, status: "partial", reason: "Coverage pending" },
    yesterday,
    today,
    null,
  );
  assert.deepEqual(
    pending.rows.map(row => row.name),
    [...draftRosters.map(owner => owner.name)].sort((a, b) => a.localeCompare(b)),
  );
  assert.ok(pending.rows.every(row => row.rank === null && row.seasonPoints === null));
});

test("current provisional standings add verified daily events to the confirmed baseline for every owner", () => {
  const kormPlayerIds = [
    8476453, 8479318, 8478483, 8479343, 8480839, 8476459,
    8479407, 8477951, 8480002, 8480014, 8481533, 8476448,
    8474564, 8475184, 8476462, 8477346, 8482671, 8476885,
  ];
  const goalieIdsByRound: Record<number, number[]> = {
    13: [8476932, 8475683, 8478007],
    18: [8476914, 8478048, 8482193],
  };
  let skaterIndex = 0;
  const standingsRosters = draftRosters.map((owner, ownerIndex) => owner.id === "korm"
    ? {
        ...owner,
        selections: owner.selections.map(selection => {
          if (selection.assetType === "goalieTeam") {
            return {
              ...selection,
              goalieNamesPending: false,
              goalies: goalieIdsByRound[selection.round]!.map((nhlPlayerId, goalieIndex) => ({
                nhlPlayerId,
                confirmedName: `Korm goalie ${goalieIndex + 1}`,
                confirmedTeam: selection.confirmedTeam ?? "Fixture Team",
                identitySource: "fixture",
              })),
            };
          }
          const nhlPlayerId = kormPlayerIds[skaterIndex++]!;
          return {
            ...selection,
            nhlPlayerId,
            confirmedName: selection.confirmedName ?? `Korm skater ${skaterIndex}`,
            confirmedTeam: selection.confirmedTeam ?? "Fixture Team",
          };
        }),
      }
    : {
        ...owner,
        selections: [{
          ...owner.selections[0]!,
          assetType: "skater" as const,
          nhlPlayerId: 90000 + ownerIndex,
          confirmedName: owner.selections[0]!.confirmedName ?? owner.name,
          confirmedTeam: owner.selections[0]!.confirmedTeam ?? "Fixture Team",
        }],
      });
  const baseRows = standingsRosters.flatMap(owner => owner.selections.flatMap(selection => {
    const assets = selection.assetType === "goalieTeam"
      ? (selection.goalies ?? []).map(goalie => ({
          assetType: "goalie" as const,
          nhlPlayerId: goalie.nhlPlayerId,
        }))
      : [{
          assetType: "skater" as const,
          nhlPlayerId: selection.nhlPlayerId ?? null,
        }];
    return assets.map(asset => ({
      ownerId: owner.id,
      round: selection.round,
      assetType: asset.assetType,
      nhlPlayerId: asset.nhlPlayerId,
      goals: 0,
      assists: 0,
      powerPlayGoals: 0,
      shortHandedGoals: 0,
      overtimeGoals: 0,
      poolPoints: owner.id === "korm" && selection.round === 1 ? 2 : 0,
      gamesPlayed: 0,
      wins: null,
      shutouts: null,
    }));
  }));
  const baseline: PoolScoringSnapshot = {
    status: "available",
    reason: null,
    asOf: null,
    season: 20262027,
    coverageThroughDate: "2026-09-30",
    rows: baseRows,
  };
  const prior: DailyPoolScoringSnapshot = {
    date: "2026-09-30",
    status: "final",
    verifiedFinalCoverage: true,
    summary: "verified",
    scoring: [],
    owners: standingsRosters.map(owner => ({
      ownerId: owner.id,
      ownerName: owner.name,
      dailyPoints: owner.id === "korm" ? 7 : 0,
      seasonPoints: owner.id === "korm" ? 2 : 0,
      rank: 1,
      previousRank: null,
      narrative: "",
      scoring: [],
    })),
  };
  const dailyEvent = (playerId: string, playerName: string, poolPoints: number) => ({
    ownerId: "korm",
    ownerName: "Korm",
    playerId,
    playerName,
    team: "EDM",
    goals: playerId === "8478406" ? 1 : 0,
    assists: 0,
    powerPlayGoals: 0,
    shortHandedGoals: 0,
    overtimeGoals: 0,
    hatTrick: false,
    poolPoints,
    scoringBreakdown: [],
  });
  const current: DailyPoolScoringSnapshot = {
    date: "2026-10-01",
    status: "pending",
    summary: "Another game and player remain unresolved.",
    scoring: [
      dailyEvent("8478048", "Igor Shesterkin", 12),
      dailyEvent("8476459", "Mika Zibanejad", 3),
      dailyEvent("8482671", "Owen Power", 2),
      dailyEvent("8479343", "Clayton Keller", 1),
      dailyEvent("8476462", "Dougie Hamilton", 1),
      dailyEvent("8479407", "Jesper Bratt", 1),
      dailyEvent("8476453", "Nikita Kucherov", 1),
      dailyEvent("8474564", "Steven Stamkos", 1),
    ],
    owners: [],
  };
  const currentWithDuplicateAndUnownedRows = {
    ...current,
    scoring: [
      ...current.scoring,
      dailyEvent("8478048", "Duplicate goalie row", 12),
      dailyEvent("999999", "Unowned player", 100),
    ],
  };
  const provisional = scoredStandings(
    standingsRosters,
    { ...baseline, status: "partial", reason: "A current player row is pending." },
    prior,
    currentWithDuplicateAndUnownedRows,
    "2026-10-01",
    true,
  );

  assert.equal(provisional.status, "partial");
  assert.equal(provisional.date, "2026-10-01");
  assert.equal(provisional.rows.length, 9);
  assert.ok(provisional.rows.every(row => row.rank !== null && row.seasonPoints !== null));
  const korm = provisional.rows.find(row => row.id === "korm")!;
  assert.equal(korm.livePoints, 22);
  assert.equal(korm.seasonPoints, 24);
  assert.equal(korm.yesterdayPoints, 7);
  assert.equal(korm.gamesPlayed, null);
  assert.equal(korm.pointsPerGame, null);
  assert.equal(provisional.reason?.startsWith("Live provisional"), true);
  assert.match(provisional.reason ?? "", /baseline through 2026-09-30/);
  assert.match(provisional.reason ?? "", /pending points are not included/);
  assert.equal(standingsRosters.find(owner => owner.id === "korm")?.selections.length, 20);
  assert.equal(baseRows.filter(row => row.ownerId === "korm").length, 24);
  assert.equal(completeRosterScoringTotals(standingsRosters, baseRows)?.get("korm"), 2);

  const duplicateUnknown = [
    ...baseRows,
    { ...baseRows.find(row => row.ownerId === "korm" && row.round === 13)!, nhlPlayerId: 999999 },
  ];
  assert.equal(completeRosterScoringTotals(standingsRosters, duplicateUnknown), null);

  // After Toronto midnight, yesterday may still be partial. Its known points
  // belong in the season subtotal, not in the new day's live column.
  const nextDay: DailyPoolScoringSnapshot = {
    ...current,
    date: "2026-10-02",
    scoring: [
      dailyEvent("8478048", "Igor Shesterkin", 2),
      dailyEvent("8476453", "Nikita Kucherov", 1),
      dailyEvent("8478048", "Duplicate goalie", 2),
      dailyEvent("999999", "Unowned player", 100),
    ],
  };
  const history = {
    baselineDate: "2026-09-30",
    baselineDaily: prior,
    interveningDays: [currentWithDuplicateAndUnownedRows],
  };
  const afterMidnight = scoredStandings(
    standingsRosters, baseline, current, nextDay, "2026-10-02",
    true, null, "2026-10-02", history,
  );
  const nextKorm = afterMidnight.rows.find(row => row.id === "korm")!;
  assert.ok(afterMidnight.rows.every(row => row.rank !== null && row.seasonPoints !== null));
  assert.equal(nextKorm.seasonPoints, 27); // baseline 2 + Oct 1's 22 + Oct 2's 3
  assert.equal(nextKorm.livePoints, 3);
  assert.equal(nextKorm.yesterdayPoints, 22);
  assert.match(afterMidnight.reason ?? "", /baseline through 2026-09-30/);

  const beforeGames = scoredStandings(
    standingsRosters, baseline, current, { ...nextDay, scoring: [] }, "2026-10-02",
    true, null, "2026-10-02", history,
  );
  assert.equal(beforeGames.rows.find(row => row.id === "korm")?.seasonPoints, 24);
  assert.equal(beforeGames.rows.find(row => row.id === "korm")?.livePoints, 0);

  const unavailableToday = scoredStandings(
    standingsRosters, baseline, current,
    { ...nextDay, status: "unavailable", scoring: [] }, "2026-10-02",
    true, null, "2026-10-02", history,
  );
  assert.equal(unavailableToday.rows.find(row => row.id === "korm")?.seasonPoints, 24);
  assert.equal(unavailableToday.rows.find(row => row.id === "korm")?.livePoints, null);

  const thirdDay = scoredStandings(
    standingsRosters, baseline, nextDay,
    { ...nextDay, date: "2026-10-03", scoring: [] }, "2026-10-03",
    true, null, "2026-10-03",
    { ...history, interveningDays: [currentWithDuplicateAndUnownedRows, nextDay] },
  );
  assert.equal(thirdDay.rows.find(row => row.id === "korm")?.seasonPoints, 27);
  assert.equal(thirdDay.rows.find(row => row.id === "korm")?.yesterdayPoints, 3);
  assert.equal(thirdDay.rows.find(row => row.id === "korm")?.livePoints, 0);

  for (const invalidHistory of [
    { ...history, interveningDays: [] },
    { ...history, interveningDays: [current, current] },
    { ...history, baselineDaily: { ...prior, owners: [] } },
    { ...history, baselineDaily: { ...prior, date: "2026-09-29" } },
    { ...history, baselineDaily: { ...prior, status: "pending" as const, verifiedFinalCoverage: false } },
  ]) {
    const rejected = scoredStandings(
      standingsRosters, baseline, current, nextDay, "2026-10-02",
      true, null, "2026-10-02", invalidHistory,
    );
    assert.ok(rejected.rows.every(row => row.rank === null && row.seasonPoints === null));
    // Known day points do not depend on whether a season baseline is rankable.
    assert.equal(rejected.rows.find(row => row.id === "korm")?.livePoints, 3);
  }
  const incompleteBaseline = scoredStandings(
    standingsRosters,
    { ...baseline, rows: baseRows.slice(1) }, current, nextDay, "2026-10-02",
    true, null, "2026-10-02", history,
  );
  assert.ok(incompleteBaseline.rows.every(row => row.rank === null && row.seasonPoints === null));

  const historical = scoredStandings(
    standingsRosters,
    baseline,
    { ...prior, date: "2026-09-29" },
    { ...current, date: "2026-09-30", status: "final", scoring: [] },
    "2026-09-30",
  );
  assert.equal(historical.date, "2026-09-30");
  assert.equal(historical.rows.find(row => row.id === "korm")?.seasonPoints, 2);
});

test("playing counts unique skaters and each selected goalie team once", () => {
  const rosters = [{
    id: "owner",
    name: "Owner",
    selections: [
      {
        round: 1,
        originalText: "Skater",
        assetType: "skater" as const,
        position: "F" as const,
        reviewNote: null,
        nhlPlayerId: 10,
        confirmedName: "Skater",
        confirmedTeam: "Dallas Stars",
      },
      {
        round: 2,
        originalText: "G:BUF",
        confirmedTeam: "Buffalo Sabres",
        assetType: "goalieTeam" as const,
        position: "G" as const,
        reviewNote: null,
        goalieNamesPending: false,
        // Named goalie rows and their individual clubs do not change the team count.
        goalies: [
          { nhlPlayerId: 10, confirmedName: "Skater", confirmedTeam: "Dallas Stars", identitySource: "test" },
          { nhlPlayerId: 20, confirmedName: "Goalie One", confirmedTeam: "Toronto Maple Leafs", identitySource: "test" },
          { nhlPlayerId: 21, confirmedName: "Goalie Two", confirmedTeam: "Winnipeg Jets", identitySource: "test" },
          { nhlPlayerId: 22, confirmedName: "Goalie Three", confirmedTeam: "Utah Mammoth", identitySource: "test" },
        ],
      },
    ],
  }];
  const schedule: NhlDayFeed = {
    date: "2026-10-01",
    games: [
      {
        id: 1, season: 20262027, gameType: 2, gameDate: "2026-10-01", gameState: "FUT",
        startTimeUTC: null, awayAbbrev: "DAL", awayName: "Dallas Stars", awayScore: null,
        homeAbbrev: "TOR", homeName: "Toronto Maple Leafs", homeScore: null, poolEligible: true,
      },
      {
        id: 2, season: 20262027, gameType: 2, gameDate: "2026-10-01", gameState: "FUT",
        startTimeUTC: null, awayAbbrev: "WPG", awayName: "Winnipeg Jets", awayScore: null,
        homeAbbrev: "DAL", homeName: "Dallas Stars", homeScore: null, poolEligible: true,
      },
      {
        id: 3, season: 20262027, gameType: 2, gameDate: "2026-10-01", gameState: "FUT",
        startTimeUTC: null, awayAbbrev: "CBJ", awayName: "Columbus Blue Jackets", awayScore: null,
        homeAbbrev: "BUF", homeName: "Buffalo Sabres", homeScore: null, poolEligible: true,
      },
    ],
  };

  assert.equal(scheduledPlayerCounts(rosters, "2026-10-01", schedule).get("owner"), 2);
  const goalieSelection = rosters[0]!.selections[1]!;
  const twelveSkaters = Array.from({ length: 12 }, (_, index) => ({
    ...rosters[0]!.selections[0]!, round: index + 1, nhlPlayerId: 100 + index,
  }));
  assert.equal(scheduledPlayerCounts(
    [{ ...rosters[0]!, selections: [...twelveSkaters, goalieSelection] }],
    "2026-10-01", schedule,
  ).get("owner"), 13);
  assert.equal(scheduledPlayerCounts(
    [{ ...rosters[0]!, selections: [...rosters[0]!.selections, goalieSelection, rosters[0]!.selections[0]!] }],
    "2026-10-01", schedule,
  ).get("owner"), 2);
  assert.equal(scheduledPlayerCounts(
    [{ ...rosters[0]!, selections: [{ ...goalieSelection, goalieNamesPending: true, goalies: [] }] }],
    "2026-10-01", schedule,
  ).get("owner"), 1);
  assert.equal(scheduledPlayerCounts(
    rosters, "2026-10-01", { ...schedule, games: schedule.games.slice(0, 2) },
  ).get("owner"), 1);
  assert.equal(scheduledPlayerCounts(rosters, "2026-10-01", { ...schedule, games: [] }).get("owner"), 0);
  assert.equal(scheduledPlayerCounts(rosters, "2026-10-02", schedule).get("owner"), null);
  assert.equal(scheduledPlayerCounts(rosters, "2026-10-01", null).get("owner"), null);
  const noScoring = scoredStandings(
    rosters,
    { status: "unavailable", reason: null, asOf: null, season: 20262027, coverageThroughDate: null, rows: [] },
    { date: "2026-09-30", status: "pending", summary: "Pending", scoring: [], owners: [] },
    { date: "2026-10-01", status: "pending", summary: "Pending", scoring: [], owners: [] },
    "2026-10-01",
    false,
    schedule,
  );
  assert.equal(noScoring.rows[0]?.playing, 2);
  assert.equal(
    scheduledPlayerCounts(
      [{ ...rosters[0]!, selections: [{ ...rosters[0]!.selections[0]!, confirmedTeam: null }] }],
      "2026-10-01",
      schedule,
    ).get("owner"),
    null,
  );
  assert.equal(
    scheduledPlayerCounts(
      [{ ...rosters[0]!, selections: [{ ...rosters[0]!.selections[0]!, nhlPlayerId: null }] }],
      "2026-10-01",
      schedule,
    ).get("owner"),
    null,
  );
});

test("prior-day verified scoring remains visible as a known subtotal while other games are pending", () => {
  const rosters = [
    {
      id: "known",
      name: "Known",
      selections: [{
        round: 1, originalText: "Player", assetType: "skater" as const,
        position: "F" as const, reviewNote: null, nhlPlayerId: 10,
      }],
    },
    {
      id: "unknown",
      name: "Unknown",
      selections: [{
        round: 1, originalText: "Other Player", assetType: "skater" as const,
        position: "F" as const, reviewNote: null, nhlPlayerId: 11,
      }],
    },
  ];
  const priorPending: DailyPoolScoringSnapshot = {
    date: "2026-09-30",
    status: "pending",
    summary: "Some prior-day games remain unresolved.",
    scoring: [{
      ownerId: "known",
      ownerName: "Known",
      playerId: "10",
      playerName: "Player",
      team: "DAL",
      goals: 1,
      assists: 0,
      powerPlayGoals: 0,
      shortHandedGoals: 0,
      overtimeGoals: 0,
      hatTrick: false,
      poolPoints: 4,
      scoringBreakdown: [],
    }],
    owners: [],
  };
  const pendingSnapshot: PoolScoringSnapshot = {
    status: "unavailable",
    reason: "Season totals pending.",
    asOf: null,
    season: 20262027,
    coverageThroughDate: null,
    rows: [],
  };
  const today: DailyPoolScoringSnapshot = {
    date: "2026-10-01", status: "pending", summary: "Pending", scoring: [], owners: [],
  };
  const standings = scoredStandings(rosters, pendingSnapshot, priorPending, today, "2026-10-01");
  assert.equal(standings.rows.find(row => row.id === "known")?.yesterdayPoints, 4);
  assert.equal(standings.rows.find(row => row.id === "unknown")?.yesterdayPoints, null);
  const wrongDate = scoredStandings(
    rosters,
    pendingSnapshot,
    { ...priorPending, date: "2026-09-29" },
    today,
    "2026-10-01",
  );
  assert.equal(wrongDate.rows.find(row => row.id === "known")?.yesterdayPoints, null);
});