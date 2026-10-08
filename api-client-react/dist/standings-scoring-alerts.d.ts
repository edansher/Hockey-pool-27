import type { DailyScoringRow, StandingsSnapshot } from "./generated/api.schemas";
export declare const SCORING_ALERT_DURATION_MS = 60000;
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
export declare const emptyScoringAlerts: () => StandingsScoringAlertState;
export declare const expireScoringAlerts: (state: StandingsScoringAlertState, now: number) => StandingsScoringAlertState;
/** Snapshot deltas use only verified earned-day scoring, never full-season totals. */
export declare function updateScoringAlerts(state: StandingsScoringAlertState, snapshot: StandingsSnapshot, now: number, currentDate: string): StandingsScoringAlertState;
export {};
//# sourceMappingURL=standings-scoring-alerts.d.ts.map