import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Search } from "lucide-react";
import {
  POOL_REFRESH_INTERVAL_MS, buildPoolLeaders, poolLeaderId, getGetDraftRostersQueryKey, getGetPoolScoringQueryKey,
  useGetDraftRosters, useGetPoolScoring,
} from "@workspace/api-client-react";
import { PosBadge, PosLegend, posBg } from "./position-style";
import type { PoolLeader } from "@workspace/api-client-react";
import { InjuryStatusPanel, PlayerInjuryBadge, injuryCellStyle, injuryRowStyle, usePlayerInjuries } from "./player-injury-status";

import { SeasonRef, useSeasonRefs } from "./season-reference";
const card = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1]";
const opts = { staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: POOL_REFRESH_INTERVAL_MS, refetchOnMount: true as const };
const val = (v: number | null) => v === null ? <span className="text-[#87918e]">Pending</span> : v;
export const leaderId = (l: PoolLeader) => poolLeaderId(l);
const isPending = (l: PoolLeader) => l.assetType === "goalie" && l.nhlPlayerId === null;

export function usePoolLeaders() {
  const rosters = useGetDraftRosters({ query: { queryKey: getGetDraftRostersQueryKey(), ...opts } });
  const scoring = useGetPoolScoring({ query: { queryKey: getGetPoolScoringQueryKey(), ...opts } });
  const leaders = useMemo(() => rosters.data && scoring.data ? buildPoolLeaders(rosters.data, scoring.data) : [], [rosters.data, scoring.data]);
  const snap = scoring.data;
  const loading = (rosters.isLoading && !rosters.data) || (scoring.isLoading && !snap);
  const error = (rosters.isError && !rosters.data) || (scoring.isError && !snap);
  const official = snap?.status === "available";
  const rankOf = (l: PoolLeader): number | null => official && l.poolPoints !== null ? leaders.findIndex(r => r.poolPoints === l.poolPoints) + 1 : null;
  const refetch = () => { rosters.refetch(); scoring.refetch(); };
  return { leaders, rankOf, snap, loading, error, official, refetch, refreshFailed: (rosters.isError || scoring.isError) && !!snap };
}

function statusText(h: ReturnType<typeof usePoolLeaders>) {
  const s = h.snap;
  if (!s) return "Pool scoring status not reported. Only known values are shown; nothing is estimated.";
  const when = s.asOf ? ` · as of ${new Date(s.asOf).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })} Toronto` : "";
  const cov = s.coverageThroughDate ? ` · coverage through ${s.coverageThroughDate}` : "";
  const label = s.status === "available" ? "Official pool scoring" : s.status === "partial" ? "Partial coverage — values shown are known-only, others pending" : s.status === "stale" ? "Stale snapshot — may be out of date" : "Scoring unavailable — scores pending";
  return `${label}${when}${cov}${s.reason ? ` · ${s.reason}` : ""}`;
}

function Status({ h }: { h: ReturnType<typeof usePoolLeaders> }) {
  return <div aria-live="polite" data-testid="pool-leaders-status" className="rounded-xl border border-[#d8d1c3] bg-[#f0ece1] p-3 text-xs leading-5 text-[#627177]">
    {statusText(h)}
    {h.refreshFailed && <span className="block text-[#9c553b]" role="status">Latest refresh failed; last returned data remains visible.</span>}
    <span className="block">Pool points follow this league's scoring rules. They are not NHL game scores or NHL points.</span>
  </div>;
}

function Problem({ h }: { h: ReturnType<typeof usePoolLeaders> }) {
  if (h.loading) return <div role="status" aria-busy="true" className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ebe6db]" />)}</div>;
  return <div role="alert" className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-4 text-sm text-[#874838]">Could not load drafted player scoring. <button className="ml-2 underline" onClick={h.refetch} data-testid="button-retry-leaders">Retry</button></div>;
}

export function TopPlayerLeaders() {
  const h = usePoolLeaders();
  const refs = useSeasonRefs();
  const injuries = usePlayerInjuries();
  const injuryById = useMemo(() => new Map(injuries.data?.players.map(p => [p.nhlPlayerId, p]) ?? []), [injuries.data]);
  const injuryStale = injuries.isError || injuries.data?.status === "stale" || injuries.data?.status === "unavailable";
  const known = h.leaders.filter(l => l.poolPoints !== null).slice(0, 25);
  return <section className={`${card} p-4 md:p-5`} data-testid="top-player-leaders">
    <div className="flex items-start justify-between gap-3">
      <div><div className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">Drafted player scoring</div><h2 className="display mt-1 text-2xl font-bold text-[#173a4c] md:text-3xl">Top 25 pool scorers</h2></div>
      <Link href="/players" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[#15566d]" data-testid="link-all-players">All players <ArrowRight size={14} /></Link>
    </div>
    <p className="mt-1 text-xs text-[#788480]">Pool points are earned while owned. Season ref. is full-season Pool Points, reference only.</p>
    <div className="mt-3">
      {(h.loading || h.error) ? <Problem h={h} /> : known.length === 0 ? <p className="rounded-xl bg-[#f0ece1] p-4 text-sm text-[#627177]" data-testid="top-leaders-pending">Player pool scores are pending. {statusText(h)}</p> : <>
        <ol className="divide-y divide-[#e5dfd3]">{known.map((l) => {
          const injury = l.nhlPlayerId === null ? undefined : injuryById.get(l.nhlPlayerId);
          const injured = injury?.status === "injured";
          return <li key={leaderId(l)} style={injured ? injuryRowStyle : posBg(l.position)} className="flex items-center gap-3 px-2 py-2.5" data-injured={injured ? "true" : "false"} data-testid={injured && l.nhlPlayerId !== null ? `row-injured-${l.nhlPlayerId}` : `top-leader-${leaderId(l)}`}>
            <span className={`display w-7 text-xl font-bold ${injured ? "text-[#7f1421]" : "text-[#82908c]"}`}>{h.rankOf(l) ?? "·"}</span>
            <div className="min-w-0 flex-1"><span className={`block truncate text-sm font-semibold ${injured ? "text-[#7f1421]" : "text-[#254456]"}`}><PosBadge position={l.position} />{l.name}{l.team ? <span className={`mono ml-1 text-[10px] ${injured ? "text-[#7f1421]" : "text-[#82908c]"}`}>{l.team}</span> : null}</span>
              <PlayerInjuryBadge injury={injury} stale={injuryStale} />
              <Link href={`/rosters/${l.ownerId}`} className="text-[11px] text-[#15566d] hover:underline">{l.ownerName}</Link></div>
            <span className={`mono text-sm font-semibold ${injured ? "text-[#7f1421]" : ""}`}>{l.poolPoints} points<SeasonRef className="block text-right font-normal" value={refs.exact(l.ownerId, l.round, l.nhlPlayerId)} /></span></li>;
        })}</ol>
        {!h.official && <p className="mt-2 text-xs text-[#806b39]">Not an official ranking: scoring status is {h.snap?.status ?? "unreported"}; known values only.</p>}
      </>}
    </div>
  </section>;
}

export function PlayersLeaderboard() {
  const h = usePoolLeaders();
  const refs = useSeasonRefs();
  const injuries = usePlayerInjuries();
  const injuryById = useMemo(() => new Map(injuries.data?.players.map(p => [p.nhlPlayerId, p]) ?? []), [injuries.data]);
  const injuryStale = injuries.isError || injuries.data?.status === "stale" || injuries.data?.status === "unavailable";
  const [injuredOnly, setInjuredOnly] = useState(false);
  const [kind, setKind] = useState<"all" | "skater" | "goalie" | "pending">("all");
  const [team, setTeam] = useState("");
  const [q, setQ] = useState("");
  const teams = useMemo(() => [...new Set(h.leaders.map(l => l.team).filter((t): t is string => !!t))].sort(), [h.leaders]);
  const confirmedCount = h.leaders.filter(l => !isPending(l)).length;
  const pendingCount = h.leaders.length - confirmedCount;
  const rows = h.leaders.filter(l => (kind === "all" || (kind === "pending" ? isPending(l) : kind === "goalie" ? l.assetType === "goalie" && !isPending(l) : l.assetType === kind)) && (!team || l.team === team)
    && (!injuredOnly || (l.nhlPlayerId !== null && injuryById.get(l.nhlPlayerId)?.status === "injured"))
    && (!q.trim() || `${l.name} ${l.ownerName} ${l.team ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const field = "min-h-11 rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3 text-sm text-[#53666e] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]";
  return <div className="space-y-4" data-testid="players-leaderboard">
    <Status h={h} />
    <InjuryStatusPanel query={injuries} />
    <PosLegend />
    <div className="flex flex-wrap gap-2">
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3"><Search size={16} className="text-[#8a9691]" /><input aria-label="Search owner, player or NHL club" value={q} onChange={e => setQ(e.target.value)} placeholder="Owner, player, club" className="w-44 bg-transparent text-sm outline-none" data-testid="input-player-search" /></label>
      <select aria-label="List" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={field} data-testid="select-asset-kind"><option value="all">All {h.leaders.length} rows</option><option value="skater">Skaters</option><option value="goalie">Confirmed goalies</option><option value="pending">Pending goalie slots</option></select>
      <select aria-label="NHL club" value={team} onChange={e => setTeam(e.target.value)} className={field} data-testid="select-team"><option value="">All clubs</option>{teams.map(t => <option key={t}>{t}</option>)}</select>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5bcbc] bg-[#fff5f3] px-3 text-sm font-semibold text-[#a01d2c]"><input type="checkbox" checked={injuredOnly} onChange={e => setInjuredOnly(e.target.checked)} data-testid="filter-injured-only" />Injured only</label>
    </div>
    <section className={`${card} overflow-hidden`}>
      {(h.loading || h.error) ? <div className="p-4"><Problem h={h} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
        <caption className="sr-only">Drafted assets ranked by pool points</caption>
        <thead><tr className="border-b border-[#e1dccf] bg-[#f0ece1] text-[10px] uppercase tracking-[.1em] text-[#788480]">
          <th scope="col" className="px-4 py-3">{h.official ? "Rank" : "#"}</th><th scope="col" className="px-3 py-3">Name</th><th scope="col" className="px-3 py-3">Team</th><th scope="col" className="px-3 py-3">Owner</th>
          {["Goals", "PPG", "SHG", "A", "OTG", "W", "SO", "Pool points", "Season pool pts (ref.)"].map(c => <th key={c} scope="col" className="px-3 py-3 text-right">{c}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={13} className="p-6 text-center text-sm text-[#627177]">No rows match these filters.</td></tr> : rows.map((l) => {
          const g = l.assetType === "goalie";
          const pend = isPending(l);
          const injury = l.nhlPlayerId === null ? undefined : injuryById.get(l.nhlPlayerId);
          const injured = injury?.status === "injured";
          const na = <span aria-label="Not applicable">N/A</span>;
          return <tr key={leaderId(l)} style={injured ? injuryRowStyle : posBg(l.position)} className="border-b border-[#ebe6db] last:border-0" data-injury-status={injury?.status ?? "unknown"} data-injured={injured ? "true" : "false"} data-testid={injured && l.nhlPlayerId !== null ? `row-injured-${l.nhlPlayerId}` : `row-leader-${leaderId(l)}`}>
            <td style={injured ? injuryCellStyle : undefined} className={`mono px-4 py-3 text-sm ${injured ? "text-[#7f1421]" : "text-[#82908c]"}`}>{h.rankOf(l) ?? "—"}</td>
             <td style={injured ? injuryCellStyle : undefined} className="px-3 py-3"><PosBadge position={l.position} /><Link href={`/players/${encodeURIComponent(leaderId(l))}`} className={`font-semibold hover:underline ${injured ? "text-[#7f1421]" : "text-[#254456]"}`}>{l.name}</Link>
               <PlayerInjuryBadge injury={injury} stale={injuryStale} />
               {g && <div className={`text-[11px] ${injured ? "text-[#7f1421]" : "text-[#788480]"}`}>{pend ? `Round ${l.round} · slot unscored, not zero` : `Goalie · Round ${l.round} · ID ${l.nhlPlayerId}`}</div>}</td>
            <td style={injured ? injuryCellStyle : undefined} className={`px-3 py-3 text-sm ${injured ? "text-[#7f1421]" : "text-[#627177]"}`}>{l.team ?? "Pending"}</td>
            <td style={injured ? injuryCellStyle : undefined} className={`px-3 py-3 text-sm ${injured ? "text-[#7f1421]" : ""}`}><Link href={`/rosters/${l.ownerId}`} className={`${injured ? "text-[#7f1421]" : "text-[#15566d]"} hover:underline`} data-testid={`link-leader-owner-${leaderId(l)}`}>{l.ownerName}</Link></td>
            {[l.goals, l.powerPlayGoals, l.shortHandedGoals, l.assists, l.overtimeGoals, l.wins, l.shutouts].map((v, k) => <td key={k} style={injured ? injuryCellStyle : undefined} className={`mono px-3 py-3 text-right text-sm tabular-nums ${injured ? "text-[#7f1421]" : "text-[#627177]"}`}>{g && [1, 2, 4].includes(k) ? na : !g && k > 4 ? na : val(v)}</td>)}
            <td style={injured ? injuryCellStyle : undefined} className={`mono px-3 py-3 text-right text-sm font-semibold tabular-nums ${injured ? "text-[#7f1421]" : "text-[#173a4c]"}`}>{val(l.poolPoints)}</td><td style={injured ? injuryCellStyle : undefined} className="mono px-3 py-3 text-right text-sm tabular-nums text-[#788480]">{(() => { const s = refs.exact(l.ownerId, l.round, l.nhlPlayerId); return s == null ? "—" : s; })()}</td></tr>;
        })}</tbody></table></div>}
      <div className="border-t border-[#e1dccf] px-4 py-2 text-xs text-[#788480]">{h.loading ? "" : `${rows.length} of ${h.leaders.length} rows (${confirmedCount} confirmed players, ${pendingCount} pending goalie-name slots) · undrafted players are not listed`}</div>
    </section>
  </div>;
}

export function PlayerLeaderDetail({ id }: { id: string }) {
  const h = usePoolLeaders();
  const refs = useSeasonRefs();
  const injuries = usePlayerInjuries();
  const l = h.leaders.find(x => leaderId(x) === decodeURIComponent(id));
  if (h.loading || h.error) return <Problem h={h} />;
  if (!l) return <div className={`${card} p-5 text-sm text-[#627177]`}>This drafted asset was not found. <Link href="/players" className="underline">Players leaderboard</Link> · <Link href="/rosters" className="underline">Owners</Link></div>;
  const g = l.assetType === "goalie";
  const pend = isPending(l);
  const injury = l.nhlPlayerId === null ? undefined : injuries.data?.players.find(p => p.nhlPlayerId === l.nhlPlayerId);
  const injuryStale = injuries.isError || injuries.data?.status === "stale" || injuries.data?.status === "unavailable";
  const base: [string, number | null][] = g ? [["Goals", l.goals], ["Assists", l.assists], ["Wins", l.wins], ["Shutouts", l.shutouts], ["Pool points", l.poolPoints]] : [["Goals", l.goals], ["PPG", l.powerPlayGoals], ["SHG", l.shortHandedGoals], ["Assists", l.assists], ["OTG", l.overtimeGoals], ["Pool points", l.poolPoints]];
  const stats: [string, number | null][] = [...base, ["Season pool pts (ref.)", refs.exact(l.ownerId, l.round, l.nhlPlayerId)]];
   return <div className="space-y-4"><Status h={h} /><InjuryStatusPanel query={injuries} /><PosLegend />
      <section className={`${card} p-6 ${injury?.status === "injured" ? "text-[#7f1421]" : ""}`} style={injury?.status === "injured" ? injuryRowStyle : posBg(l.position)}>
       <div className="mb-2"><PosBadge position={l.position} /></div><h2 className={`display text-4xl font-bold ${injury?.status === "injured" ? "text-[#7f1421]" : "text-[#173a4c]"}`}>{l.name}</h2>
        <PlayerInjuryBadge injury={injury} stale={injuryStale} />
       <p className={`mt-1 text-sm ${injury?.status === "injured" ? "text-[#7f1421]" : "text-[#627177]"}`}>{pend ? "Goalie name pending" : g ? `Goalie · ID ${l.nhlPlayerId}` : `ID ${l.nhlPlayerId ?? "pending"}`} · {l.team ?? "Team pending"} · Round {l.round} · <Link href={`/rosters/${l.ownerId}`} className={`${injury?.status === "injured" ? "text-[#7f1421]" : "text-[#15566d]"} underline`}>{l.ownerName}'s roster</Link></p>
       <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{stats.map(([k, v]) => <div key={k} className={`rounded-xl p-3 ${injury?.status === "injured" ? "bg-[#f8dddd] text-[#7f1421]" : "bg-[#f0ece1]"}`}><div className={`mono text-[10px] uppercase ${injury?.status === "injured" ? "text-[#7f1421]" : "text-[#82908c]"}`}>{k}</div><div className="mono mt-1 text-lg font-semibold">{val(v)}</div></div>)}</div>
    {g && <p className="mt-4 rounded-xl bg-[#f0ece1] p-3 text-xs leading-5 text-[#627177]" data-testid="goalie-rules-note">{pend ? "No confirmed NHL goalie identity for this slot yet. Points are unknown, not zero. " : ""}Goalie scoring: win 2, shutout win 5 total instead of the win value, assist 3, goal 10. PP, SH and OT goals are N/A for goalies.</p>}
    </section></div>;
}
