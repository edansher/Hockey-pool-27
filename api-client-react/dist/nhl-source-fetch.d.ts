import type { NhlSourceSnapshot } from "./generated/api.schemas";
export declare const NHL_SOURCE_TIMEOUT_MS = 15000;
/** Direct DTO request with a 15s timeout composed with the caller's abort signal (no AbortSignal.timeout/any). */
export declare function fetchNhlSourceWithTimeout(outer?: AbortSignal, timeoutMs?: number): Promise<NhlSourceSnapshot>;
//# sourceMappingURL=nhl-source-fetch.d.ts.map