import { ExternalLink } from "lucide-react";
import { POOL_REFRESH_INTERVAL_MS, getGetPoolInjuriesQueryKey, useGetPoolInjuries } from "@workspace/api-client-react";
import type { PoolPlayerInjury } from "@workspace/api-client-react";

export function usePlayerInjuries() {
  return useGetPoolInjuries({ query: {
    queryKey: getGetPoolInjuriesQueryKey(),
    staleTime: 60_000,
    refetchInterval: (q) => q.state.data?.status === "refreshing" ? 5_000 : POOL_REFRESH_INTERVAL_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  } });
}

export function injuryDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "not yet available";
  return new Date(value).toLocaleString("en-CA", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Toronto",
  });
}

export function injurySourceName(url?: string | null) {
  if (!url) return "Injury source";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("cbssports")) return "CBS Sports";
    if (host.includes("espn")) return "ESPN";
    if (host.includes("nhl.com")) return "NHL.com";
    return host;
  } catch {
    return "Injury source";
  }
}

export const injuryRowStyle = {
  backgroundColor: "#fce8e8",
  boxShadow: "inset 5px 0 0 #9f1828",
};
export const injuryCellStyle = { backgroundColor: injuryRowStyle.backgroundColor };

export function InjuryStatusPanel({ query }: { query: ReturnType<typeof usePlayerInjuries> }) {
  const d = query.data;
  const sourceName = injurySourceName(d?.sourceUrl);
  const statusIsStale = d?.status === "stale" || d?.status === "unavailable" || query.isError;
  return <div className="rounded-xl border border-[#e5bcbc] bg-[#fff5f3] p-3 text-xs leading-5 text-[#6a4c4c]" aria-live="polite" data-testid="player-injury-status">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-[#a01d2c]">Red = reported injury</strong>
      <span>{d ? `${sourceName} injury list` : "Injury list"} · Automatic check: daily at 8:00 a.m. Toronto time</span>
    </div>
    {d ? <>
      {d.lastSuccessAt ? <p>{d.confirmedInjured} pool players reported injured · Last successful check: {injuryDate(d.lastSuccessAt)} Toronto</p> : <p>The initial injury report is not yet available.</p>}
      {d.nextRefreshAt && <p>Next check: {injuryDate(d.nextRefreshAt)} Toronto</p>}
      {d.unknownPlayers > 0 && <p>{d.unknownPlayers} of {d.totalPlayers} player statuses are not confirmed by the reports. Unhighlighted does not mean healthy.</p>}
      {statusIsStale && <p role="status" className="font-semibold">Injury update unavailable or stale. Showing last-known reports where available; they may be out of date.</p>}
      {d.status === "refreshing" && <p role="status">Checking the {sourceName} injury list now… Last-known injury reports remain visible while checking.</p>}
      {d.error && <p>{d.error}</p>}
      {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">View the complete NHL injury list on {sourceName} <ExternalLink size={12} aria-hidden="true" /></a>}
    </> : <p>{query.isLoading ? "Checking the injury list…" : "Injury reports are unavailable. No injury or healthy status has been guessed."}</p>}
    {query.isError && <button onClick={() => query.refetch()} className="ml-3 min-h-11 underline" data-testid="retry-injuries">Retry injury report</button>}
    <p>Injured players remain on their owners’ lists. Injury highlights do not change points or position badges.</p>
  </div>;
}

export function PlayerInjuryBadge({ injury, stale = false }: { injury?: PoolPlayerInjury; stale?: boolean }) {
  if (injury?.status !== "injured") return null;
  const label = `${stale ? "Last-known injury" : "Injured"}${injury.details ? ` · ${injury.details}` : ""}`;
  return <div className="mt-1 text-[11px] font-semibold text-[#a01d2c]" data-testid={`injury-${injury.nhlPlayerId}`}>
    <span className="mr-1 inline-block rounded bg-[#a01d2c] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">INJURED</span>
    {injury.sourceUrl ? <a href={injury.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" title={`${label} · reported ${injuryDate(injury.reportedAt)} Toronto`} aria-label={`${injury.name}: ${label}. ${injurySourceName(injury.sourceUrl)} source, opens in a new tab.`}>{injury.details ?? `${injurySourceName(injury.sourceUrl)} report`} <ExternalLink size={11} className="inline" aria-hidden="true" /></a> : injury.details}
    <span className="ml-1 font-normal">· {injuryDate(injury.reportedAt)} Toronto</span>
    {stale && <span className="ml-1 font-semibold">(last-known report)</span>}
  </div>;
}