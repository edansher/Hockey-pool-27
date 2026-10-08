import type { loadDraftRosters } from "./draft-roster-store";
import type {
  DailyPoolScoringSnapshot,
  PoolScoringRow,
  PoolScoringSnapshot,
} from "./pool-scoring-service";
import { LIVE_PROVISIONAL_REASON, teamAbbreviation } from "./pool-scoring-service";
import { NHL_TEAM_NAMES } from "../data/draft-roster-identities";
import type { NhlDayFeed } from "./nhl-source-parser";
import { ownershipPoolDate } from "./ownership-scoring";

function previousCalendarDate(date: string): string {
  const previous = new Date(`${date}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

/** Counts scheduled skaters individually and each owned goalie club once. */
export function scheduledPlayerCounts(
  rosters: Awaited<ReturnType<typeof import("./draft-roster-store").loadDraftRosters>>,
  date: string | null,
  schedule: NhlDayFeed | null,
): Map<string, number | null> {
  const counts = new Map<string, number | null>();
  if (
    !date ||
    !schedule ||
    schedule.date !== date ||
    !Array.isArray(schedule.games) ||
    schedule.games.some(game =>
      game.gameDate !== date ||
      !Object.hasOwn(NHL_TEAM_NAMES, game.homeAbbrev) ||
      !Object.hasOwn(NHL_TEAM_NAMES, game.awayAbbrev),
    )
  ) {
    for (const owner of rosters) counts.set(owner.id, null);
    return counts;
  }

  const teamsPlaying = new Set(
    schedule.games
      .filter(game => game.poolEligible)
      .flatMap(game => [game.homeAbbrev, game.awayAbbrev]),
  );
  for (const owner of rosters) {
    const ownedPlayers = new Map<number, string>();
    const goalieTeams = new Set<string>();
    let verified = owner.selections.length > 0;
    const addPlayer = (
      id: number | null | undefined,
      name: string | null | undefined,
      team: string | null | undefined,
    ) => {
      if (!Number.isSafeInteger(id) || !id || !name?.trim()) {
        verified = false;
        return;
      }
      const abbreviation = teamAbbreviation(team);
      if (!abbreviation) {
        verified = false;
        return;
      }
      const existing = ownedPlayers.get(id);
      if (existing && existing !== abbreviation) {
        verified = false;
        return;
      }
      ownedPlayers.set(id, abbreviation);
    };

    for (const selection of owner.selections) {
      if (selection.droppedAt && date >= ownershipPoolDate(selection.droppedAt)) continue;
      if (selection.acquiredAt && date < ownershipPoolDate(selection.acquiredAt)) continue;
      if (selection.assetType === "skater") {
        addPlayer(selection.nhlPlayerId, selection.confirmedName, selection.confirmedTeam);
        continue;
      }
      const club = teamAbbreviation(
        selection.confirmedTeam ?? selection.originalText.replace(/^G:\s*/i, ""),
      );
      if (!club) verified = false;
      else goalieTeams.add(club);
    }
    counts.set(
      owner.id,
      verified
        ? [...ownedPlayers.values()].filter(team => teamsPlaying.has(team)).length
          + [...goalieTeams].filter(team => teamsPlaying.has(team)).length
        : null,
    );
  }
  return counts;
}

/** Compatibility helper for callers with no connected official source. */
export function pendingStandings(
  rosters: Awaited<ReturnType<typeof import("./draft-roster-store").loadDraftRosters>>,
  date: string | null,
) {
  return {
    status: "unavailable" as const,
    reason: date
      ? "Historical standings are pending until official NHL results are linked to verified draft picks and pool scoring is calculated."
      : "Official NHL game data is checked every five minutes. Pool scoring is not yet available; points and ranks are pending, not zero.",
    asOf: null,
    date,
    rows: rosters.map(owner => ({
      id: owner.id,
      name: owner.name,
      rank: null,
      previousRank: null,
      rankMovement: null,
      seasonPoints: null,
      yesterdayPoints: null,
      livePoints: null,
      playing: null,
      gamesPlayed: null,
      pointsPerGame: null,
      transactionsUsed: null,
      rosterComplete: owner.selections.length > 0 && owner.selections.every(selection =>
        Boolean(selection.confirmedName && selection.confirmedTeam),
      ),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function rankOwners(totals: Array<{ id: string; points: number }>) {
  const sorted = [...totals].sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  const ranks = new Map<string, number>();
  let priorPoints: number | null = null;
  let priorRank = 0;
  sorted.forEach((row, index) => {
    const rank = priorPoints === row.points ? priorRank : index + 1;
    ranks.set(row.id, rank);
    priorPoints = row.points;
    priorRank = rank;
  });
  return ranks;
}

/** Validate and sum only scoring rows that map one-to-one to saved draft picks. */
export function completeRosterScoringTotals(
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>,
  rows: PoolScoringRow[],
): Map<string, number> | null {
  const rowsBySlot = new Map<string, PoolScoringRow[]>();
  const rowsByOwner = new Map<string, PoolScoringRow[]>();
  for (const row of rows) {
    const slot = `${row.ownerId}:${row.round}`;
    rowsBySlot.set(slot, [...(rowsBySlot.get(slot) ?? []), row]);
    rowsByOwner.set(row.ownerId, [...(rowsByOwner.get(row.ownerId) ?? []), row]);
  }
  const totals = new Map<string, number>();
  for (const owner of rosters) {
    if (owner.selections.length === 0) return null;
    const claimedRows = new Set<PoolScoringRow>();
    let total = 0;
    for (const selection of owner.selections) {
      let expectedAssetType: "skater" | "goalie";
      let expectedPlayerIds: number[];
      if (selection.assetType === "goalieTeam") {
        const goalies = selection.goalies ?? [];
        if (
          selection.goalieNamesPending ||
          goalies.length === 0 ||
          goalies.some(goalie =>
            !Number.isSafeInteger(goalie.nhlPlayerId) || goalie.nhlPlayerId <= 0,
          ) ||
          new Set(goalies.map(goalie => goalie.nhlPlayerId)).size !== goalies.length
        ) return null;
        expectedAssetType = "goalie";
        expectedPlayerIds = goalies.map(goalie => goalie.nhlPlayerId);
      } else {
        if (!selection.nhlPlayerId || !Number.isSafeInteger(selection.nhlPlayerId)) return null;
        expectedAssetType = "skater";
        expectedPlayerIds = [selection.nhlPlayerId];
      }

      const slotRows = rowsBySlot.get(`${owner.id}:${selection.round}`) ?? [];
      if (slotRows.length !== expectedPlayerIds.length) return null;
      for (const playerId of expectedPlayerIds) {
        const matches = slotRows.filter(row =>
          row.assetType === expectedAssetType && row.nhlPlayerId === playerId,
        );
        if (matches.length !== 1 || matches[0]!.poolPoints === null) return null;
        const [row] = matches;
        claimedRows.add(row!);
        total += row!.poolPoints!;
      }
    }
    if (claimedRows.size !== (rowsByOwner.get(owner.id)?.length ?? 0)) return null;
    totals.set(owner.id, total);
  }
  return totals;
}

type ConfirmedStandingsHistory = {
  baselineDate: string;
  baselineDaily: DailyPoolScoringSnapshot;
  interveningDays: DailyPoolScoringSnapshot[];
};

/** Daily rows contain verified facts; deduplicate within, never across, days. */
function ownedDailyTotals(
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>,
  daily: DailyPoolScoringSnapshot,
): Map<string, number> {
  const totals = new Map<string, number>();
  const rosterById = new Map(rosters.map(owner => [owner.id, owner]));
  const countedAssets = new Set<string>();
  for (const row of daily.scoring) {
    const owner = rosterById.get(row.ownerId);
    const playerId = Number(row.playerId);
    if (!owner || !Number.isSafeInteger(playerId)) continue;
    const ownsPlayer = owner.selections.some(selection =>
      selection.assetType === "goalieTeam"
        ? selection.goalies?.some(goalie => goalie.nhlPlayerId === playerId) === true
        : selection.nhlPlayerId === playerId,
    );
    const key = `${row.ownerId}:${playerId}`;
    if (!ownsPlayer || countedAssets.has(key)) continue;
    countedAssets.add(key);
    totals.set(row.ownerId, (totals.get(row.ownerId) ?? 0) + row.poolPoints);
  }
  return totals;
}

/** Preserve the nine saved owners, but never rank or zero-fill incomplete totals. */
export function scoredStandings(
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>,
  snapshot: PoolScoringSnapshot,
  yesterday: DailyPoolScoringSnapshot,
  today: DailyPoolScoringSnapshot,
  date: string | null,
  confirmedThroughFallback = false,
  schedule: NhlDayFeed | null = null,
  scheduleDate: string | null = date,
  confirmedHistory?: ConfirmedStandingsHistory,
) {
  const playingCounts = scheduledPlayerCounts(rosters, scheduleDate, schedule);
  const rowPoints = new Map<string, number[]>();
  const rowGames = new Map<string, number>();
  for (const row of snapshot.rows) {
    if (row.poolPoints !== null) {
      rowPoints.set(row.ownerId, [...(rowPoints.get(row.ownerId) ?? []), row.poolPoints]);
    }
    if (row.gamesPlayed !== null) {
      rowGames.set(row.ownerId, (rowGames.get(row.ownerId) ?? 0) + row.gamesPlayed);
    }
  }

  const liveTotals = ownedDailyTotals(rosters, today);
  const interveningTotals = new Map<string, number>();
  for (const daily of confirmedHistory?.interveningDays ?? []) {
    for (const [ownerId, points] of ownedDailyTotals(rosters, daily)) {
      interveningTotals.set(ownerId, (interveningTotals.get(ownerId) ?? 0) + points);
    }
  }
  const confirmedBaselineTotals = confirmedThroughFallback
    ? completeRosterScoringTotals(rosters, snapshot.rows)
    : null;
  const confirmedThroughDate = confirmedThroughFallback && confirmedHistory
    ? confirmedHistory.baselineDate
    : confirmedThroughFallback && date
    ? (() => {
        const prior = new Date(`${date}T00:00:00.000Z`);
        prior.setUTCDate(prior.getUTCDate() - 1);
        return prior.toISOString().slice(0, 10);
      })()
    : null;
  const ownerSeasonTotals = rosters.map(owner => {
    const values = rowPoints.get(owner.id) ?? [];
    const selectionsWithPoints = snapshot.rows.filter(row => row.ownerId === owner.id);
    const complete = values.length === selectionsWithPoints.length && selectionsWithPoints.length > 0;
    const baselinePoints = confirmedBaselineTotals?.get(owner.id);
    return {
      id: owner.id,
      name: owner.name,
      points: confirmedThroughFallback && baselinePoints !== undefined
        ? baselinePoints + (interveningTotals.get(owner.id) ?? 0) + (liveTotals.get(owner.id) ?? 0)
        : complete ? values.reduce((sum, value) => sum + value, 0) : null,
      gamesPlayed: !confirmedThroughFallback &&
        selectionsWithPoints.length > 0 &&
        selectionsWithPoints.every(row => row.gamesPlayed !== null)
          ? rowGames.get(owner.id) ?? null
          : null,
      rosterComplete: owner.selections.length > 0 && owner.selections.every(selection =>
        selection.assetType === "goalieTeam"
          ? Boolean(!selection.goalieNamesPending && selection.goalies?.length)
          : Boolean(selection.confirmedName && selection.nhlPlayerId),
      ),
    };
  });

  const liveProvisional =
    snapshot.status === "partial" &&
    snapshot.reason?.startsWith(LIVE_PROVISIONAL_REASON) === true;
  const yesterdayVerified =
    yesterday.status === "final" || yesterday.verifiedFinalCoverage === true;
  const confirmedHistoryVerified = !confirmedHistory
    ? yesterdayVerified
    : Boolean(
        date &&
        today.date === date &&
        confirmedHistory.baselineDate < date &&
        snapshot.coverageThroughDate &&
        snapshot.coverageThroughDate >= confirmedHistory.baselineDate &&
        (snapshot.status === "available" || snapshot.status === "stale") &&
        confirmedHistory.baselineDaily.date === confirmedHistory.baselineDate &&
        (confirmedHistory.baselineDaily.status === "final" ||
          confirmedHistory.baselineDaily.verifiedFinalCoverage === true) &&
        rosters.every(owner =>
          confirmedHistory.baselineDaily.owners.some(row => row.ownerId === owner.id),
        ) &&
        (() => {
          let cursor = previousCalendarDate(date);
          for (const daily of [...confirmedHistory.interveningDays].reverse()) {
            if (daily.date !== cursor) return false;
            cursor = previousCalendarDate(cursor);
          }
          return cursor === confirmedHistory.baselineDate;
        })(),
      );
  const staleKnownTotals =
    snapshot.status === "stale" &&
    yesterdayVerified &&
    ownerSeasonTotals.every(owner => owner.points !== null);
  const totalsRankable =
    (snapshot.status === "available" || liveProvisional || staleKnownTotals || confirmedThroughFallback) &&
    (confirmedThroughFallback ? confirmedHistoryVerified : yesterdayVerified) &&
    ownerSeasonTotals.every(owner => owner.points !== null);
  const currentRanks = totalsRankable
    ? rankOwners(ownerSeasonTotals.map(owner => ({ id: owner.id, points: owner.points! })))
    : new Map<string, number>();
  const priorRanks = new Map(yesterday.owners.map(owner => [owner.ownerId, owner.rank]));
  const yesterdayOwners = new Map(yesterday.owners.map(owner => [owner.ownerId, owner]));
  const priorDate = scheduleDate ?? date;
  const yesterdayDateMatches = priorDate === null || yesterday.date === previousCalendarDate(priorDate);
  const yesterdayCoverageVerified =
    yesterday.status === "final" || yesterday.verifiedFinalCoverage === true;
  const rosterById = new Map(rosters.map(owner => [owner.id, owner]));
  const yesterdayKnownTotals = new Map<string, number>();
  const countedYesterdayPlayers = new Set<string>();
  for (const row of yesterday.scoring) {
    const owner = rosterById.get(row.ownerId);
    const nhlPlayerId = Number(row.playerId);
    if (!owner || !Number.isSafeInteger(nhlPlayerId) || nhlPlayerId <= 0 || row.poolPoints <= 0) continue;
    const ownsPlayer = owner.selections.some(selection =>
      selection.assetType === "goalieTeam"
        ? selection.goalies?.some(goalie => goalie.nhlPlayerId === nhlPlayerId) === true
        : selection.nhlPlayerId === nhlPlayerId,
    );
    const assetKey = `${row.ownerId}:${nhlPlayerId}`;
    if (!ownsPlayer || countedYesterdayPlayers.has(assetKey)) continue;
    countedYesterdayPlayers.add(assetKey);
    yesterdayKnownTotals.set(
      row.ownerId,
      (yesterdayKnownTotals.get(row.ownerId) ?? 0) + row.poolPoints,
    );
  }
  return {
    status: totalsRankable && !confirmedThroughFallback && !liveProvisional && !staleKnownTotals
      ? "available" as const
      : "partial" as const,
    reason: confirmedThroughFallback && totalsRankable
      ? `Live provisional: standings show known subtotals from the confirmed baseline through ${confirmedThroughDate ?? "the prior date"} plus verified daily events since that baseline; pending points are not included until official game and player facts are confirmed.${snapshot.status === "stale" && snapshot.reason ? ` Baseline warning: ${snapshot.reason}` : ""}`
      : totalsRankable && !liveProvisional && !staleKnownTotals
      ? null
      : liveProvisional
        ? LIVE_PROVISIONAL_REASON
        : snapshot.reason ??
        (yesterday.status !== "final"
          ? yesterday.summary
          : "Official season coverage or saved scoring facts are incomplete; totals and ranks are pending, not zero."),
    asOf: snapshot.asOf,
    date,
    rows: ownerSeasonTotals.map(owner => ({
      id: owner.id,
      name: owner.name,
      rank: totalsRankable ? currentRanks.get(owner.id) ?? null : null,
      previousRank: totalsRankable && !confirmedThroughFallback ? priorRanks.get(owner.id) ?? null : null,
      rankMovement: totalsRankable && !confirmedThroughFallback && priorRanks.has(owner.id)
        ? (priorRanks.get(owner.id)! - (currentRanks.get(owner.id) ?? priorRanks.get(owner.id)!))
        : null,
      seasonPoints: totalsRankable ? owner.points : null,
      yesterdayPoints: !yesterdayDateMatches
        ? null
        : yesterdayCoverageVerified && yesterdayOwners.has(owner.id)
          ? yesterdayOwners.get(owner.id)!.dailyPoints
          : (yesterdayKnownTotals.get(owner.id) ?? 0) > 0
            ? yesterdayKnownTotals.get(owner.id)!
            : null,
      livePoints: date !== null && today.date !== date
        ? null
        : (liveTotals.get(owner.id) ?? 0) > 0
          ? liveTotals.get(owner.id)!
          : today.status === "final" || today.verifiedFinalCoverage === true ||
            (totalsRankable && today.status !== "unavailable")
            ? 0
            : null,
      playing: playingCounts.get(owner.id) ?? null,
      gamesPlayed: totalsRankable ? owner.gamesPlayed : null,
      pointsPerGame: totalsRankable && owner.points !== null && owner.gamesPlayed
        ? owner.points / owner.gamesPlayed
        : totalsRankable && owner.points === 0
          ? 0
          : null,
      transactionsUsed: null,
      rosterComplete: owner.rosterComplete,
    })).sort((a, b) => {
      if (a.rank !== null && b.rank !== null) {
        return a.rank - b.rank || a.name.localeCompare(b.name);
      }
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.name.localeCompare(b.name);
    }),
  };
}