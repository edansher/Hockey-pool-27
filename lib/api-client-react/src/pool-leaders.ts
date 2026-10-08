import type {
  DraftRoster,
  DraftRosterSelection,
  PoolScoringRow,
  PoolScoringSnapshot,
} from "./generated/api.schemas";
import { isDraftSelectionVerified } from "./draft-selection-order";

export type PoolLeader = {
  ownerId: string;
  ownerName: string;
  round: number;
  assetType: "skater" | "goalie";
  position: DraftRosterSelection["position"];
  nhlPlayerId: number | null;
  name: string;
  team: string | null;
  goals: number | null;
  powerPlayGoals: number | null;
  shortHandedGoals: number | null;
  assists: number | null;
  overtimeGoals: number | null;
  poolPoints: number | null;
  gamesPlayed: number | null;
  wins: number | null;
  shutouts: number | null;
};

/** Goalie siblings share an original round, but never a scoring identity. */
export function poolLeaderId(leader: Pick<PoolLeader, "ownerId" | "round" | "assetType" | "nhlPlayerId">): string {
  const slot = `${leader.ownerId}:${leader.round}`;
  return leader.assetType === "goalie" ? `${slot}:${leader.nhlPlayerId ?? "pending"}` : slot;
}

/**
 * Club picks remain original draft evidence only. Never consume their legacy
 * aggregate scores when joining named goalies or pending goalie-name slots.
 */
export function draftSelectionScoringRows(
  selection: DraftRosterSelection,
  rows: readonly PoolScoringRow[],
  ownerId?: string,
): PoolScoringRow[] {
  const candidates = rows.filter(row =>
    row.round === selection.round && (ownerId === undefined || row.ownerId === ownerId),
  );
  if (selection.assetType === "skater") {
    return candidates.filter(row => row.assetType === "skater" &&
      (row.nhlPlayerId === null || !selection.nhlPlayerId || row.nhlPlayerId === selection.nhlPlayerId));
  }
  const goalieIds = new Set(selection.goalies?.map(goalie => goalie.nhlPlayerId) ?? []);
  return candidates.filter(row => row.assetType === "goalie" &&
    (goalieIds.size > 0 ? row.nhlPlayerId !== null && goalieIds.has(row.nhlPlayerId) : row.nhlPlayerId === null));
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function lastName(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).at(-1) ?? "";
}

function compareNames(left: string, right: string) {
  return compareText(lastName(left), lastName(right)) || compareText(left, right);
}

function comparePoolPoints(left: number | null, right: number | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
}

/**
 * Expands photo-confirmed goalies within their original draft slots, then joins
 * each individual by owner, round and NHL ID. Unnamed slots remain pending.
 * This intentionally does not assign leaderboard ranks; callers should use the
 * scoring snapshot status when deciding whether the results can be presented as
 * an official ranking.
 */
export function buildPoolLeaders(
  rosters: readonly DraftRoster[],
  snapshot?: PoolScoringSnapshot,
): PoolLeader[] {
  const rowsByOwnerAndRound = new Map<string, Map<number, PoolScoringRow[]>>();
  for (const row of snapshot?.rows ?? []) {
    let rowsByRound = rowsByOwnerAndRound.get(row.ownerId);
    if (!rowsByRound) {
      rowsByRound = new Map();
      rowsByOwnerAndRound.set(row.ownerId, rowsByRound);
    }
    const siblings = rowsByRound.get(row.round) ?? [];
    siblings.push(row);
    rowsByRound.set(row.round, siblings);
  }

  const leaders = rosters.flatMap((roster) =>
    roster.selections.flatMap((selection): PoolLeader[] => {
      const candidates = draftSelectionScoringRows(
        selection, rowsByOwnerAndRound.get(roster.id)?.get(selection.round) ?? [], roster.id,
      );
      const stats = (scoring: PoolScoringRow | undefined) => ({
        goals: scoring?.goals ?? null,
        powerPlayGoals: scoring?.powerPlayGoals ?? null,
        shortHandedGoals: scoring?.shortHandedGoals ?? null,
        assists: scoring?.assists ?? null,
        overtimeGoals: scoring?.overtimeGoals ?? null,
        poolPoints: scoring?.poolPoints ?? null,
        gamesPlayed: scoring?.gamesPlayed ?? null,
        wins: scoring?.wins ?? null,
        shutouts: scoring?.shutouts ?? null,
      });
      if (selection.assetType === "goalieTeam") {
        const goalies = selection.goalies ?? [];
        if (!goalies.length) {
          return [{
            ownerId: roster.id, ownerName: roster.name, round: selection.round,
            assetType: "goalie", position: "G", nhlPlayerId: null,
            name: "Goalie names pending", team: selection.confirmedTeam?.trim() || null,
            ...stats(undefined),
          }];
        }
        return goalies.map(goalie => ({
          ownerId: roster.id, ownerName: roster.name, round: selection.round,
          assetType: "goalie", position: "G", nhlPlayerId: goalie.nhlPlayerId,
          name: goalie.confirmedName, team: goalie.confirmedTeam,
          ...stats(candidates.find(row => row.nhlPlayerId === goalie.nhlPlayerId)),
          powerPlayGoals: null, shortHandedGoals: null, overtimeGoals: null,
        }));
      }
      const verified = isDraftSelectionVerified(selection);
      const confirmedTeam = verified ? selection.confirmedTeam?.trim() || null : null;
      const name = verified
        ? selection.confirmedName?.trim() || selection.originalText
        : selection.originalText;
      const scoring = candidates[0];

      return [{
        ownerId: roster.id,
        ownerName: roster.name,
        round: selection.round,
        assetType: selection.assetType,
        position: selection.position,
        nhlPlayerId: verified
          ? selection.nhlPlayerId ?? null
          : null,
        name,
        team: confirmedTeam,
        ...stats(scoring),
      }];
    }),
  );

  return leaders.sort((left, right) =>
    comparePoolPoints(left.poolPoints, right.poolPoints)
      || compareNames(left.name, right.name)
      || compareText(left.ownerName, right.ownerName)
      || compareText(left.ownerId, right.ownerId)
      || left.round - right.round
      || (left.nhlPlayerId ?? 0) - (right.nhlPlayerId ?? 0),
  );
}