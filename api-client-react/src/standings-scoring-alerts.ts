import type { DailyScoringRow, StandingsSnapshot } from "./generated/api.schemas";

export const SCORING_ALERT_DURATION_MS = 60_000;
type Counts = Pick<DailyScoringRow, "goals" | "assists" | "powerPlayGoals" | "overtimeGoals" | "shortHandedGoals" | "poolPoints">;
export interface StandingsScoringAlert {
  id: string;
  ownerId: string;
  playerName: string;
  actions: string[];
  expiresAt: number;
}
export interface StandingsScoringAlertState {
  date: string | null;
  baseline: Record<string, Counts>;
  alerts: StandingsScoringAlert[];
}
export const emptyScoringAlerts = (): StandingsScoringAlertState => ({ date: null, baseline: {}, alerts: [] });
export const expireScoringAlerts = (state: StandingsScoringAlertState, now: number): StandingsScoringAlertState => ({
  ...state, alerts: state.alerts.filter(alert => alert.expiresAt > now),
});

/** Snapshot deltas use only verified earned-day scoring, never full-season totals. */
export function updateScoringAlerts(state: StandingsScoringAlertState, snapshot: StandingsSnapshot, now: number, currentDate: string): StandingsScoringAlertState {
  if (!snapshot.date || snapshot.date !== currentDate) return emptyScoringAlerts();
  const freshDay = state.date !== snapshot.date;
  const next = freshDay ? emptyScoringAlerts() : expireScoringAlerts(state, now);
  const baseline = { ...next.baseline };
  const alerts = [...next.alerts];
  for (const owner of snapshot.rows) {
    if (owner.todayScorers === undefined || owner.livePoints === null) continue;
    const ownerKey = JSON.stringify([owner.id]);
    const initialized = baseline[ownerKey] !== undefined;
    // A verified empty scorer list is a real baseline; unavailable evidence is not.
    baseline[ownerKey] = { goals: 0, assists: 0, powerPlayGoals: 0, overtimeGoals: 0, shortHandedGoals: 0, poolPoints: 0 };
    const players = new Map<string, DailyScoringRow>();
    for (const player of owner.todayScorers) {
      if (player.ownerId !== owner.id) continue;
      const prior = players.get(player.playerId);
      players.set(player.playerId, prior ? { ...player,
        goals: prior.goals + player.goals, assists: prior.assists + player.assists,
        powerPlayGoals: prior.powerPlayGoals + player.powerPlayGoals,
        overtimeGoals: prior.overtimeGoals + player.overtimeGoals,
        shortHandedGoals: prior.shortHandedGoals + player.shortHandedGoals,
        poolPoints: prior.poolPoints + player.poolPoints,
      } : player);
    }
    for (const player of players.values()) {
      const key = JSON.stringify([owner.id, player.playerId]);
      const previous = baseline[key] ?? { goals: 0, assists: 0, powerPlayGoals: 0, overtimeGoals: 0, shortHandedGoals: 0, poolPoints: 0 };
      const goals = Math.max(0, player.goals - previous.goals);
      const assists = Math.max(0, player.assists - previous.assists);
      const overtime = Math.min(goals, Math.max(0, player.overtimeGoals - previous.overtimeGoals));
      const shortHanded = Math.min(goals - overtime, Math.max(0, player.shortHandedGoals - previous.shortHandedGoals));
      const powerPlay = Math.min(goals - shortHanded, Math.max(0, player.powerPlayGoals - previous.powerPlayGoals));
      const actions: string[] = [];
      const combinedOtPowerPlay = goals === 1 && overtime === 1 && powerPlay === 1;
      // Daily counts do not identify which of multiple goals were both OT and
      // power-play. Show the total and known descriptors rather than guess.
      const ambiguousOverlap = goals > 1 && overtime > 0 && powerPlay > 0;
      for (const [label, count] of [
        [ambiguousOverlap ? "Goals" : "Goal", ambiguousOverlap ? goals : Math.max(0, goals - overtime - shortHanded - powerPlay)],
        ["Assist", assists],
        [combinedOtPowerPlay ? "OT power-play goal" : "OT goal", overtime],
        ["Shorthanded goal", shortHanded],
        ["Power-play goal", combinedOtPowerPlay ? 0 : powerPlay],
      ] as const) {
        if (count > 0) actions.push(count > 1 ? `${label} ×${count}` : label);
      }
      if (initialized && actions.length && player.poolPoints > previous.poolPoints) {
        alerts.push({ id: JSON.stringify([key, player.goals, player.assists, player.poolPoints]),
          ownerId: owner.id, playerName: player.playerName, actions, expiresAt: now + SCORING_ALERT_DURATION_MS });
      }
      // High-water counters prevent stale polls, disappearances and later restorations
      // from replaying old goals. New pool days get a completely fresh baseline.
      baseline[key] = {
        goals: Math.max(previous.goals, player.goals), assists: Math.max(previous.assists, player.assists),
        powerPlayGoals: Math.max(previous.powerPlayGoals, player.powerPlayGoals),
        overtimeGoals: Math.max(previous.overtimeGoals, player.overtimeGoals),
        shortHandedGoals: Math.max(previous.shortHandedGoals, player.shortHandedGoals),
        poolPoints: Math.max(previous.poolPoints, player.poolPoints),
      };
    }
  }
  return { date: snapshot.date, baseline, alerts };
}