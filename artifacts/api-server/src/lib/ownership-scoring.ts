import type { DraftRosterSelection } from "@workspace/db";
import { getPoolDates } from "@workspace/pool-calendar";
import type { PoolScoringRow } from "./pool-scoring-service";

export const OWNERSHIP_SCORE_FIELDS = [
  "goals", "assists", "powerPlayGoals", "shortHandedGoals", "overtimeGoals",
  "poolPoints", "gamesPlayed", "wins", "shutouts",
] as const;
export type OwnershipScore = NonNullable<DraftRosterSelection["frozenScoring"]>;

export function scoreValues(row: OwnershipScore): OwnershipScore {
  return Object.fromEntries(OWNERSHIP_SCORE_FIELDS.map(key => [key, row[key]])) as OwnershipScore;
}

export function subtractOwnershipBaseline(
  score: OwnershipScore, baseline?: OwnershipScore,
): OwnershipScore {
  if (!baseline) return scoreValues(score);
  return Object.fromEntries(OWNERSHIP_SCORE_FIELDS.map(key => [
    key, score[key] === null || baseline[key] === null
      ? score[key] : Math.max(0, score[key]! - baseline[key]!),
  ])) as OwnershipScore;
}

export function ownershipPoolDate(instant: string): string {
  return getPoolDates(new Date(instant)).today;
}

export function fixedOwnershipScore(
  selection: DraftRosterSelection, date?: string,
): OwnershipScore | null {
  if (selection.voidedAt) return { goals: 0, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0,
    overtimeGoals: 0, poolPoints: 0, gamesPlayed: 0, wins: null, shutouts: null };
  if (selection.acquiredAt && date && date < ownershipPoolDate(selection.acquiredAt)) {
    return { goals: 0, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0,
      overtimeGoals: 0, poolPoints: 0, gamesPlayed: 0, wins: null, shutouts: null };
  }
  if (selection.droppedAt && selection.frozenScoring &&
      (!date || date >= ownershipPoolDate(selection.droppedAt))) return selection.frozenScoring;
  return null;
}

export function applyOwnershipScore(
  selection: DraftRosterSelection, row: PoolScoringRow, date?: string,
): PoolScoringRow {
  const fixed = fixedOwnershipScore(selection, date);
  return { ...row, ...(fixed ?? subtractOwnershipBaseline(row, selection.scoringBaseline)) };
}