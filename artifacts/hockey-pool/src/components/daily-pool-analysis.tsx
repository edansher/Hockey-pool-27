import { Link } from "wouter";
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, RefreshCw, ServerOff } from "lucide-react";
import { POOL_REFRESH_INTERVAL_MS, getGetDailyAnalysisQueryKey, useGetDailyAnalysis } from "@workspace/api-client-react";
import { NhlSourcePanel } from "@/components/nhl-source-panel";
import { usePreviousTorontoDate } from "@/hooks/use-previous-toronto-date";
import type { DailyScoringRow } from "@workspace/api-client-react";

const panel = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1]";
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

import { SeasonRef, useSeasonRefs } from "./season-reference";
function Scoring({ rows }: { rows: DailyScoringRow[] }) {
  const refs = useSeasonRefs();
  return <ul className="divide-y divide-[#e5dfd3]">{rows.map((r) => <li key={`${r.ownerId}-${r.playerId}`} className="py-3" data-testid={`row-scoring-${r.playerId}`}>
    <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate font-semibold text-[#254456]">{r.playerName} <span className="mono text-[10px] text-[#82908c]">{r.team}</span></span><span className="mono shrink-0 text-right font-semibold">{r.poolPoints} points<SeasonRef className="block font-normal" value={refs.byPlayer(r.ownerId, r.playerId)} /></span></div>
    <div className="mono mt-1 text-[11px] text-[#788480]">{r.goals} G · {r.assists} A{r.powerPlayGoals ? ` · ${r.powerPlayGoals} PPG` : ""}{r.shortHandedGoals ? ` · ${r.shortHandedGoals} SHG` : ""}{r.overtimeGoals ? ` · ${r.overtimeGoals} OTG` : ""}{r.hatTrick ? " · hat trick" : ""}</div>
    {r.scoringBreakdown.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{r.scoringBreakdown.map((b, index) => <span key={`${b.label}-${index}`} className="rounded-full bg-[#ece7d9] px-2 py-0.5 text-[10px] text-[#55696f]">{b.label} {b.points > 0 ? "+" : ""}{b.points}</span>)}</div>}
  </li>)}</ul>;
}

export function DailyPoolAnalysis({ date: given }: { date?: string }) {
  const previous = usePreviousTorontoDate();
  const date = given || previous;
  const q = useGetDailyAnalysis(date, { query: { queryKey: getGetDailyAnalysisQueryKey(date), staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: POOL_REFRESH_INTERVAL_MS, refetchOnMount: true } });
  const d = q.data;

  if (q.isLoading) return <div role="status" aria-busy="true" className="space-y-3" data-testid="analysis-loading">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#ebe6db]" />)}</div>;
  if (q.isError || !d) return <div role="alert" className={`${panel} p-5`} data-testid="analysis-error"><p className="flex items-center gap-2 text-sm text-[#a34e39]"><AlertCircle className="h-5 w-5" />Could not load the analysis for {fmtDate(date)}.</p><button onClick={() => q.refetch()} data-testid="button-retry-analysis" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#173a4c] px-4 text-sm font-semibold text-[#f5f0e5]"><RefreshCw className="h-4 w-4" />Retry</button></div>;

  const Icon = d.status === "unavailable" ? ServerOff : Clock3;
  const label = d.status === "final" ? "Final" : d.status === "pending" ? "Pending" : "Unavailable";
  return <div className="space-y-5" data-testid="daily-pool-analysis">
    <NhlSourcePanel compact />
    <section className={`${panel} border-l-4 ${d.status === "final" ? "border-l-[#2f745e]" : "border-l-[#c65c3e]"} p-5`} data-testid={`analysis-status-${d.status}`}>
      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#c65c3e]" /><span className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">{fmtDate(d.date)} · {label}</span></div>
      <p className="mt-2 text-sm leading-6 text-[#55696f]">{d.summary}</p>
      {d.status === "pending" && <p className="mt-2 text-xs text-[#806b39]">Scoring is still being confirmed. No provisional totals are shown.</p>}
      {d.status === "unavailable" && <p className="mt-2 text-xs text-[#874838]">Nothing is shown for this date because the data is not available. That is not a zero-point day.</p>}
    </section>
    {d.status !== "unavailable" && d.owners.length === 0 && d.scoring.length === 0 && <div className={`${panel} p-5 text-sm text-[#627177]`} data-testid="analysis-final-empty">{d.status === "final" ? "The report is final and lists no owner scoring for this date." : "Owner reports will appear when scoring is confirmed."}</div>}
    {d.owners.length > 0 && <div className="grid gap-4 md:grid-cols-2">{d.owners.map((o) => {
      const mv = o.previousRank === null ? 0 : o.previousRank - o.rank;
      return <article key={o.ownerId} className={`${panel} p-5`} data-testid={`card-owner-analysis-${o.ownerId}`}>
        <div className="flex items-start justify-between gap-3"><div><div className="mono text-[10px] uppercase tracking-[.16em] text-[#82908c]">Rank {o.rank}{mv > 0 ? <ArrowUpRight className="ml-1 inline h-3 w-3 text-[#2e7858]" /> : mv < 0 ? <ArrowDownRight className="ml-1 inline h-3 w-3 text-[#b54f39]" /> : null}</div><Link href={`/rosters/${o.ownerId}`} className="display text-3xl font-bold text-[#173a4c]">{o.ownerName}</Link></div><div className="text-right"><div className="display text-4xl font-bold text-[#c65c3e]">{o.dailyPoints}</div><div className="mono text-[10px] uppercase text-[#82908c]">Season {o.seasonPoints}</div></div></div>
        {o.narrative && <p className="mt-3 text-sm leading-6 text-[#55696f]">{o.narrative}</p>}
        {o.scoring.length > 0 && <div className="mt-3"><Scoring rows={o.scoring} /></div>}
      </article>;
    })}</div>}
    {d.owners.length > 0 && d.scoring.length > 0 && <section className={`${panel} p-5`} data-testid="analysis-top-scorers"><h2 className="display text-2xl font-bold text-[#173a4c]">Top scorers of the pool day</h2><Scoring rows={d.scoring.slice(0, 5)} />{d.scoring.length > 5 && <p className="mt-2 text-xs text-[#788480]">Top 5 of {d.scoring.length} scoring players; the rest appear on owner cards.</p>}</section>}
    {d.owners.length === 0 && d.scoring.length > 0 && <section className={`${panel} p-5`}><h2 className="display text-2xl font-bold text-[#173a4c]">Points by player</h2><Scoring rows={d.scoring} /></section>}
    <Link href="/standings" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#15566d]" data-testid="link-analysis-standings">Current standings <ArrowRight className="h-4 w-4" /></Link>
  </div>;
}
