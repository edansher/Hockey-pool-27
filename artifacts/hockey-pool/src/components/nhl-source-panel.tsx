import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { POOL_REFRESH_INTERVAL_MS, deriveSourceView, fetchNhlSourceWithTimeout, getGetNhlSourceQueryKey, useGetNhlSource } from "@workspace/api-client-react";
import type { NhlDayFeed, NhlSourceGame } from "@workspace/api-client-react";

const TZ = "America/Toronto";
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Toronto" : "not yet";
const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) + " Toronto" : "";
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

function phase(g: NhlSourceGame, cached: boolean): { kind: "scheduled" | "live" | "final" | "other"; text: string } {
  const s = g.gameState.toUpperCase();
  if (s === "FUT" || s === "PRE") return { kind: "scheduled", text: g.startTimeUTC ? `Scheduled ${clock(g.startTimeUTC)}` : "Upcoming" };
  if (s === "LIVE" || s === "CRIT") return { kind: "live", text: cached ? "Last reported in progress" : "In progress" };
  if (s === "FINAL" || s === "OFF") return { kind: "final", text: "Final" };
  return { kind: "other", text: `Status ${g.gameState}` };
}

function Game({ g, cached }: { g: NhlSourceGame; cached: boolean }) {
  const p = phase(g, cached);
  const show = p.kind === "live" || p.kind === "final" || p.kind === "other";
  const sc = (n: number | null) => (show && n !== null ? n : "–");
  return <li className="flex items-center justify-between gap-3 py-2.5" data-testid={`row-nhl-game-${g.id}`}>
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-[#254456]">{g.awayName} at {g.homeName}</div>
      <div className="mono text-[10px] uppercase tracking-wider text-[#788480]">{p.text}{!g.poolEligible ? " · Not pool-eligible" : ""}</div>
    </div>
    <div className="mono shrink-0 text-sm font-semibold text-[#173a4c]" aria-label={show ? `${g.awayAbbrev} ${sc(g.awayScore)}, ${g.homeAbbrev} ${sc(g.homeScore)}` : "No score yet"}>{g.awayAbbrev} {sc(g.awayScore)} · {g.homeAbbrev} {sc(g.homeScore)}</div>
  </li>;
}

function Day({ title, feed, id, cached }: { title: string; feed: NhlDayFeed | null; id: string; cached: boolean }) {
  return <div data-testid={id}>
    <h3 className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">{title}{feed ? ` · ${dayLabel(feed.date)}` : ""}</h3>
    {!feed ? <p className="mt-1 text-sm text-[#627177]">Not fetched yet.</p>
      : feed.games.length === 0 ? <p className="mt-1 text-sm text-[#627177]" data-testid={`${id}-empty`}>No games on {dayLabel(feed.date)}.</p>
      : <ul className="divide-y divide-[#e5dfd3]">{feed.games.map(g => <Game key={g.id} g={g} cached={cached} />)}</ul>}
  </div>;
}

function useMinuteTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN(n => n + 1);
    const id = setInterval(bump, 60_000);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => { clearInterval(id); window.removeEventListener("focus", bump); document.removeEventListener("visibilitychange", bump); };
  }, []);
}

export function NhlSourcePanel({ compact = false }: { compact?: boolean }) {
  useMinuteTick();
  const q = useGetNhlSource({ query: {
    queryKey: getGetNhlSourceQueryKey(), queryFn: ({ signal }) => fetchNhlSourceWithTimeout(signal), retry: 1,
    staleTime: POOL_REFRESH_INTERVAL_MS, refetchOnMount: true, refetchOnWindowFocus: true,
    refetchInterval: (query) => { const d = query.state.data; return !query.state.error && d && (d.isRefreshing || d.status === "starting") ? 5_000 : POOL_REFRESH_INTERVAL_MS; },
  } });
  const d = q.data;
  const view = deriveSourceView(d, q.isError);
  const degraded = view.status === "stale" || view.status === "unavailable";
  const cadence = d ? Math.round(d.refreshIntervalSeconds / 60) : 5;
  const badge = q.isLoading ? "loading" : view.status === "available" && view.isRefreshing ? "refreshing" : view.status;
  const retry = <button onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-retry-nhl-source" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#173a4c] px-4 text-sm font-semibold text-[#f5f0e5] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />Retry</button>;
  return <section className={`rounded-2xl border border-[#ded8ca] bg-[#faf8f1] ${compact ? "p-3" : "p-4"}`} data-testid={compact ? "nhl-source-compact" : "nhl-source-panel"}>
    <div className="flex items-start justify-between gap-3">
      <div><div className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">Official game feed</div>
        {!compact && <h2 className="display text-2xl font-bold text-[#173a4c]">NHL scores</h2>}</div>
      <span className="mono rounded bg-[#ece7d9] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#55696f]" data-testid="status-nhl-source">{badge}</span>
    </div>
    {q.isLoading && <div role="status" aria-busy="true" className="mt-3 space-y-2" data-testid="nhl-source-loading">{[0, 1].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ebe6db]" />)}</div>}
    {(q.isError && !d) && <div role="alert" className="mt-3 space-y-2" data-testid="nhl-source-error">
      <p className="flex items-center gap-2 text-sm text-[#a34e39]"><AlertCircle className="h-5 w-5 shrink-0" />{view.message}</p>{retry}
    </div>}
    {d && <div className="mt-2 space-y-3">
      <div className="space-y-1 text-xs leading-5 text-[#627177]" data-testid="nhl-source-meta">
        <p>Last successful NHL check: <strong data-testid="text-nhl-last-success">{when(d.lastSuccessAt)}</strong></p>
        <p>Next refresh: <span data-testid="text-nhl-next">{degraded ? "unknown" : view.isRefreshing ? "in progress" : when(d.nextRefreshAt)}</span> · Checks every {cadence} minutes</p>
        {view.status === "starting" && <p className="text-[#806b39]" data-testid="nhl-source-starting">The first NHL check is starting. Scores will appear when it completes.</p>}
        {degraded && view.message && <p className={view.status === "stale" ? "text-[#806b39]" : "text-[#874838]"} role="status" data-testid={`nhl-source-${view.status}`}>{view.message}</p>}
      </div>
      {degraded && retry}
      {!compact && (d.today || d.lastNight) && view.status !== "unavailable" && <>
        {view.cached && <p className="mono text-[10px] uppercase tracking-wider text-[#806b39]" data-testid="nhl-cached-label">Cached from {when(d.lastSuccessAt)}</p>}
        <Day title="Today" feed={d.today} id="nhl-today" cached={view.cached} />
        <Day title="Last night" feed={d.lastNight} id="nhl-last-night" cached={view.cached} />
      </>}
      {!compact && <p className="border-t border-[#e5dfd3] pt-3 text-xs leading-5 text-[#627177]" data-testid="nhl-pool-scoring-status">Official NHL regular-season event scoring is connected and feeds current pool totals. Rare unconfirmed overlapping-goal cases remain pending review; no points are estimated.</p>}
      <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid={compact ? "link-nhl-source-compact" : "link-nhl-source"} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#15566d]">Source: {d.provider}<ExternalLink className="h-4 w-4" /></a>
    </div>}
  </section>;
}
