import type { QueryClient } from "@tanstack/react-query";

/** Server archive and ordinary client data refresh cadence: five minutes. */
export const POOL_REFRESH_INTERVAL_MS = 300_000;

/** Observe the shared server archive without changing its NHL refresh schedule. */
export const POOL_LIVE_REFRESH_INTERVAL_MS = 15_000;

export function isPoolLiveQueryKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" &&
    /^\/api\/(?:standings|pool-scoring|draft-rosters|available-players|nhl-source|scoring-rules|analysis)(?:\/|$)/.test(key[0]);
}

export function isProvisionalPoolStandings(reason?: string | null): boolean {
  return Boolean(reason?.startsWith("Live provisional") ||
    reason?.startsWith("Verified live NHL events are provisional"));
}

// No React imports: each app binds this coordinator to its own runtime/lifecycle.
export function startPoolLiveRefresh(
  client: QueryClient,
  options: { isForeground?: () => boolean; intervalMs?: number } = {},
) {
  const interval = Math.max(10, options.intervalMs ?? POOL_LIVE_REFRESH_INTERVAL_MS);
  let stopped = false;
  let busy = false;
  let queued = false;
  let newestArchiveTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(delay?: number) {
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void refresh(), delay ?? Math.max(1, interval - Date.now() % interval));
  }

  async function refresh() {
    if (stopped) return;
    if (busy) { queued = true; return; }
    busy = true;
    try {
      if (options.isForeground?.() === false) return;
      // Cached tabs must fetch fresh data on return, even inside their staleTime.
      await client.invalidateQueries({
        type: "all",
        predicate: query => isPoolLiveQueryKey(query.queryKey),
        refetchType: "none",
      });
      await client.refetchQueries({
        type: "active",
        predicate: query => isPoolLiveQueryKey(query.queryKey),
      }, { cancelRefetch: false, throwOnError: false });
    } catch {
      // Query observers retain their own errors/last-good data; always retry later.
    } finally {
      busy = false;
      const followUp = queued;
      queued = false;
      schedule(followUp ? Math.min(100, interval) : undefined);
    }
  }

  const unsubscribe = client.getQueryCache().subscribe(event => {
    if (stopped || event.type !== "updated" || !isPoolLiveQueryKey(event.query.queryKey)) return;
    const data = event.query.state.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") return;
    const timestamp = Math.max(0, ...["asOf", "lastSuccessfulRefreshAt", "scoringCheckedAt"]
      .map(key => typeof data[key] === "string" ? Date.parse(data[key] as string) : 0)
      .filter(Number.isFinite));
    if (timestamp <= newestArchiveTime) return;
    newestArchiveTime = timestamp;
    if (busy) queued = true;
    else schedule(1);
  });
  schedule(1);

  return {
    refresh,
    stop() {
      stopped = true;
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
