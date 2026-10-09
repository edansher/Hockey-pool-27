import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { POOL_REFRESH_INTERVAL_MS, getGetAvailablePlayersQueryKey, useGetAvailablePlayers } from "@workspace/api-client-react";
import { PosBadge, PosLegend, posBg, posKey } from "./position-style";

const field = "min-h-11 rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3 text-sm text-[#53666e] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]";
const PAGE = 100;
const val = (v: number | null) => v === null ? <span className="text-[#87918e]">Pending</span> : v.toLocaleString();
const toronto = (v: string | null, withTime = true) => v ? new Date(v).toLocaleString("en-CA", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" } : { dateStyle: "medium", timeZone: "America/Toronto" }) : "not reported";
const dateOnly = (d: string | null) => { if (!d) return "not reported"; const [y, m, day] = d.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString("en-CA", { dateStyle: "medium", timeZone: "UTC" }); };

export function AvailablePlayers() {
  const query = useGetAvailablePlayers({ query: { queryKey: getGetAvailablePlayersQueryKey(), staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: q => !q.state.data || q.state.data.status === "unavailable" ? 5_000 : POOL_REFRESH_INTERVAL_MS, refetchOnMount: "always", refetchOnWindowFocus: true, refetchOnReconnect: true } });
  const snap = query.data;
  const [q, setQ] = useState(""); const [pos, setPos] = useState(""); const [team, setTeam] = useState(""); const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => (snap?.rows ?? []).filter(r => r.position !== "G"), [snap]);
  const teams = useMemo(() => [...new Set(rows.map(r => r.team).filter((t): t is string => !!t))].sort(), [rows]);
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter(r => (!pos || posKey(r.position) === pos) && (!team || r.team === team) && (!needle || `${r.name} ${r.team ?? ""}`.toLowerCase().includes(needle))), [rows, pos, team, needle]);
  const filtering = !!(needle || pos || team);

  if (query.isLoading) return <div role="status" aria-busy="true" className="space-y-2" data-testid="available-loading">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ebe6db]" />)}</div>;
  if (query.isError && !snap) return <div role="alert" className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-4 text-sm text-[#874838]" data-testid="available-error">Could not load available players. <button className="ml-2 underline" onClick={() => query.refetch()} data-testid="available-retry">Retry</button></div>;
  if (!snap) return null;
  const warn = snap.status === "partial" || snap.status === "stale" || rows.some(r => r.scoringStatus !== "complete");
  const cols = ["Goals", "A", "PPG", "SHG", "OTG", "GP", "Pool points"];
  const visible = filtered.slice(0, shown);
  return <div className="space-y-4" data-testid="available-players">
    <div className="rounded-xl border border-[#d8d1c3] bg-[#f0ece1] p-3 text-xs leading-5 text-[#627177]" aria-live="polite" data-testid="available-status">
      <div>{snap.totalNhlPlayers.toLocaleString()} NHL players in catalog · {snap.ownedPlayersExcluded} owned excluded · {rows.length.toLocaleString()} undrafted · {snap.catalogTeamsCovered} of {snap.catalogTeamsTotal} clubs covered</div>
       <div>Roster check {toronto(snap.lastCatalogRefreshAt)} Toronto · next roster check {toronto(snap.nextRefreshAt)} Toronto</div>
       <div>Scoring checked {toronto(snap.asOf)} Toronto · coverage through {dateOnly(snap.coverageThroughDate)}</div>
      {warn && <div className="font-semibold text-[#806b39]" data-testid="available-warning">Ranked by known pool points; totals may be incomplete{snap.reason ? ` · ${snap.reason}` : ""}</div>}
      {query.isError && <div className="text-[#9c553b]" role="status">Latest refresh failed; last returned data remains visible. <button className="underline" onClick={() => query.refetch()} data-testid="available-retry">Retry</button></div>}
    </div>
    <PosLegend showGoalies={false} />
    <div className="flex flex-wrap gap-2">
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3"><Search size={16} className="text-[#8a9691]" /><input aria-label="Search player or club" value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }} placeholder="Player or club" className="w-44 bg-transparent text-sm outline-none" data-testid="available-search" /></label>
      <select aria-label="Position" value={pos} onChange={e => { setPos(e.target.value); setShown(PAGE); }} className={field} data-testid="available-position"><option value="">All positions</option><option value="F">Forwards</option><option value="D">Defence</option></select>
      <select aria-label="NHL club" value={team} onChange={e => { setTeam(e.target.value); setShown(PAGE); }} className={field} data-testid="available-team"><option value="">All clubs</option>{teams.map(t => <option key={t}>{t}</option>)}</select>
    </div>
    <section className="overflow-hidden rounded-2xl border border-[#ded8ca] bg-[#faf8f1]">
      {rows.length === 0 ? <div className="p-8 text-center text-sm text-[#627177]" data-testid="available-empty">{snap.status === "unavailable" ? `Available players are unavailable right now${snap.reason ? `: ${snap.reason}` : "."}` : "No undrafted players are available in the catalog."}</div>
      : filtered.length === 0 ? <div className="p-8 text-center text-sm text-[#627177]" data-testid="available-no-match">No players match these filters. <button className="underline" onClick={() => { setQ(""); setPos(""); setTeam(""); }}>Clear filters</button></div>
      : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left" data-testid="available-players-table">
        <caption className="sr-only">Undrafted NHL players ranked by pool points, highest first</caption>
        <thead><tr className="border-b border-[#e1dccf] bg-[#f0ece1] text-[10px] uppercase tracking-[.1em] text-[#788480]"><th scope="col" className="px-4 py-3">#</th><th scope="col" className="px-3 py-3">Name</th><th scope="col" className="px-3 py-3">Team</th>{cols.map(c => <th key={c} scope="col" className="px-3 py-3 text-right">{c}</th>)}</tr></thead>
        <tbody>{visible.map(r => {
          const k = posKey(r.position);
          const cells = [r.goals, r.assists, r.powerPlayGoals, r.shortHandedGoals, r.overtimeGoals, r.gamesPlayed, r.poolPoints];
          return <tr key={r.nhlPlayerId} style={posBg(k)} className="border-b border-[#ebe6db] last:border-0" data-testid={`row-available-${r.nhlPlayerId}`}>
            <td className="mono px-4 py-3 text-sm text-[#82908c]">{rows.indexOf(r) + 1}</td>
            <td className="px-3 py-3"><PosBadge position={k} /><a href={`https://www.nhl.com/player/${r.nhlPlayerId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#254456] hover:underline">{r.name}<ExternalLink size={11} aria-label="opens NHL.com" /></a>
              {r.scoringStatus !== "complete" && <div className="text-[11px] text-[#806b39]">{r.scoringStatus === "pending" ? "Scoring pending, not zero" : "Partial totals"}{r.reason ? ` · ${r.reason}` : ""}</div>}</td>
            <td className="px-3 py-3 text-sm text-[#627177]">{r.team ?? "Unknown"}</td>
            {cells.map((v, i) => <td key={i} className={`mono px-3 py-3 text-right text-sm tabular-nums ${i === cells.length - 1 ? "font-semibold text-[#173a4c]" : "text-[#627177]"}`}>{val(v)}</td>)}
          </tr>;
        })}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e1dccf] px-4 py-2 text-xs text-[#788480]" data-testid="available-count">
        <span>{filtering ? `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} undrafted players match` : `${rows.length.toLocaleString()} undrafted players`} · pool points, highest first</span>
        {filtered.length > shown && <button className="min-h-11 font-semibold text-[#15566d] underline" onClick={() => setShown(shown + PAGE)} data-testid="available-load-more">Show {Math.min(PAGE, filtered.length - shown)} more</button>}
      </div>
    </section>
  </div>;
}
