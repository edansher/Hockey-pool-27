import type { QueryClient } from "@tanstack/react-query";
/** Server archive and ordinary client data refresh cadence: five minutes. */
export declare const POOL_REFRESH_INTERVAL_MS = 300000;
/** Observe the shared server archive without changing its NHL refresh schedule. */
export declare const POOL_LIVE_REFRESH_INTERVAL_MS = 15000;
export declare function isPoolLiveQueryKey(key: readonly unknown[]): boolean;
export declare function isProvisionalPoolStandings(reason?: string | null): boolean;
export declare function startPoolLiveRefresh(client: QueryClient, options?: {
    isForeground?: () => boolean;
    intervalMs?: number;
}): {
    refresh: () => Promise<void>;
    stop(): void;
};
//# sourceMappingURL=refresh.d.ts.map