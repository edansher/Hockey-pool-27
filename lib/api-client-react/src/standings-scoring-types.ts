import type { DailyScoringRow } from "./generated/api.schemas";

const order = ["G", "A", "PPG", "SH", "OTG", "W", "HAT"] as const;
type ScoringType = typeof order[number];
const labels: Record<string, ScoringType> = {
  goal: "G",
  "goalie goal": "G",
  assist: "A",
  "goalie assist": "A",
  "power-play goal": "PPG",
  "power-play goal bonus": "PPG",
  "short-handed goal": "SH",
  "overtime goal": "OTG",
  "goalie win": "W",
  "goalie shutout win": "W",
  "hat trick": "HAT",
};

/** Display verified scoring categories, never recalculate or infer awarded points. */
export function formatStandingsScoringTypes(player: DailyScoringRow): string {
  const counts = Object.fromEntries(order.map(type => [type, 0])) as Record<ScoringType, number>;
  for (const reason of player.scoringBreakdown) {
    const type = labels[reason.label.trim().toLowerCase()];
    if (type && Number.isInteger(reason.count) && reason.count > 0) counts[type] += reason.count;
  }
  const verified = order.filter(type => counts[type] > 0).map(type => `${counts[type]} ${type}`);
  if (verified.length) return verified.join(", ");

  // Frozen or ownership-adjusted rows can retain points without their original
  // per-goal categories. Report the known totals explicitly, rather than guess
  // regular goals by subtracting potentially overlapping OT/PP/SH counts.
  const totals = [
    player.goals > 0 ? `${player.goals} G total` : null,
    player.assists > 0 ? `${player.assists} A` : null,
    player.powerPlayGoals > 0 ? `${player.powerPlayGoals} PPG` : null,
    player.shortHandedGoals > 0 ? `${player.shortHandedGoals} SH` : null,
    player.overtimeGoals > 0 ? `${player.overtimeGoals} OTG` : null,
  ].filter(Boolean);
  return totals.length ? `${totals.join(", ")} (goal types may overlap)` : "Scoring type details pending";
}
