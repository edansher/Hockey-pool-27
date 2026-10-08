/** Structural subset of NhlSourceSnapshot so this helper stays pure and testable. */
export interface SourceLike {
    status: "starting" | "available" | "stale" | "unavailable";
    isRefreshing: boolean;
    lastSuccessAt: string | null;
    error: string | null;
    today: {
        date: string;
    } | null;
    lastNight: {
        date: string;
    } | null;
}
export type EffectiveStatus = "loading" | "starting" | "available" | "stale" | "unavailable";
export type StaleReason = "fetchFailed" | "aged" | "dayRollover" | "serverStale";
export interface SourceView {
    status: EffectiveStatus;
    /** True only when the server state is known (last fetch succeeded). */
    isRefreshing: boolean;
    /** Games shown come from a cached or aged snapshot and must carry a dated label. */
    cached: boolean;
    reasons: StaleReason[];
    ageMs: number | null;
    message: string | null;
}
export declare function getTorontoDate(now?: number | Date): string;
export declare function deriveSourceView(data: SourceLike | undefined, fetchFailed: boolean, nowMs?: number): SourceView;
//# sourceMappingURL=nhl-source-state.d.ts.map