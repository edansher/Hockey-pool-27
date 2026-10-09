import { useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, ChevronDown, Clock3, FileText, RefreshCw, ServerOff } from "lucide-react";
import { POOL_REFRESH_INTERVAL_MS, getGetDailyReportHistoryQueryKey, getGetPublishedDailyReportQueryKey, useGetDailyReportHistory, useGetPublishedDailyReport } from "@workspace/api-client-react";
import type { DailyReport, DailyScoringRow } from "@workspace/api-client-react";

import { SeasonRef, useSeasonRefs } from "./season-reference";
const panel = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1]";
const torontoDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const stamp = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" }).format(d) + " Toronto"; };
const signed = (n: number | null | undefined) => n == null ? "—" : n > 0 ? `+${n}` : String(n);

function useTorontoToday() {
  const [today, setToday] = useState(torontoDay);
  useEffect(() => {
    const bump = () => setToday(torontoDay());
    const id = setInterval(bump, 30_000);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => { clearInterval(id); window.removeEventListener("focus", bump); document.removeEventListener("visibilitychange", bump); };
  }, []);
  return today;
}

const H = ({ children }: { children: string }) => <h3 className="display mb-3 text-2xl font-bold text-[#173a4c]">{children}</h3>;
const Mv = ({ v }: { v: number | null }) => v == null ? <span className="text-[#9aa19a]">—</span> : <span className={`inline-flex items-center gap-0.5 font-semibold ${v > 0 ? "text-[#2e7858]" : v < 0 ? "text-[#b54f39]" : "text-[#9aa19a]"}`}>{v > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : v < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}{signed(v)}</span>;

function Scoring({ rows, id }: { rows: DailyScoringRow[]; id: string }) {
  const refs = useSeasonRefs();
  return <ul className="divide-y divide-[#e5dfd3]">{rows.map((r, i) => <li key={`${id}-${r.ownerId}-${r.playerId}-${i}`} className="py-3" data-testid={`report-row-${id}-${r.playerId}`}>
    <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 font-semibold text-[#254456]">{r.playerName} <span className="mono text-[10px] text-[#82908c]">{r.team} · {r.ownerName}</span></span><span className="mono shrink-0 text-right font-semibold">{r.poolPoints} points<SeasonRef className="block font-normal" value={refs.byPlayer(r.ownerId, r.playerId)} /></span></div>
    <div className="mono mt-1 text-[11px] text-[#788480]">{r.goals} G · {r.assists} A · {r.powerPlayGoals} PPG · {r.shortHandedGoals} SHG · {r.overtimeGoals} OTG · hat trick {r.hatTrick ? "yes" : "no"}</div>
    {r.scoringBreakdown.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{r.scoringBreakdown.map((b, j) => <span key={j} className="rounded-full bg-[#ece7d9] px-2 py-0.5 text-[10px] text-[#55696f]">{b.label} ×{b.count} {b.points > 0 ? "+" : ""}{b.points}{b.note ? ` (${b.note})` : ""}</span>)}</div>}
  </li>)}</ul>;
}

function Body({ r }: { r: DailyReport }) {
  const refs = useSeasonRefs();
  const names = r.participantsOfNight.map((p) => r.owners.find((o) => o.ownerId === p || o.ownerName === p)?.ownerName ?? p);
  const risers = r.owners.filter((o) => (o.movement ?? 0) > 0).sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0));
  const fallers = r.owners.filter((o) => (o.movement ?? 0) < 0).sort((a, b) => (a.movement ?? 0) - (b.movement ?? 0));
  const owners = [...r.owners].sort((a, b) => a.rank - b.rank);
  return <div className="space-y-6" data-testid="daily-report-body">
    <dl className="grid gap-3 rounded-xl bg-[#f1ede3] p-4 text-xs sm:grid-cols-4" data-testid="report-freshness">
      {([["Report date", r.reportDate], ["Games through", r.gamesThroughDate], ["Data updated", stamp(r.dataUpdatedAt)], ["Published", stamp(r.publishedAt)]] as const).map(([k, v]) => <div key={k}><dt className="mono text-[10px] uppercase tracking-[.14em] text-[#82908c]">{k}</dt><dd className="mt-0.5 font-semibold text-[#254456]">{v}</dd></div>)}
    </dl>
    {r.corrected && <p role="note" className="rounded-xl border border-[#e3c9a0] bg-[#faf0dc] p-3 text-sm text-[#7a5a22]" data-testid="report-corrected">Standings were subsequently corrected. This report and its commentary remain as originally published. See Standings for the latest totals.</p>}
    <p className="text-base leading-7 text-[#3f5560]" data-testid="report-summary">{r.summary}</p>
    <section><H>Standings</H><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm" data-testid="report-standings"><thead><tr className="border-b border-[#e1dccf] text-[10px] uppercase tracking-[.12em] text-[#87918e]"><th className="py-2 pr-2">Rank</th><th className="px-2">Owner</th><th className="px-2 text-right">Daily</th><th className="px-2 text-right">Total</th><th className="px-2 text-right">Move</th><th className="pl-2 text-right">Behind first</th></tr></thead><tbody>{owners.map((o) => <tr key={o.ownerId} className="border-b border-[#ebe6db] last:border-0"><td className="mono py-2 pr-2 font-semibold">{o.rank}{o.tied ? " (T)" : ""}</td><td className="px-2 font-semibold text-[#254456]">{o.ownerName}</td><td className="mono px-2 text-right">{o.dailyPoints}</td><td className="mono px-2 text-right font-semibold">{o.seasonPoints}</td><td className="mono px-2 text-right"><Mv v={o.movement} /></td><td className="mono pl-2 text-right">{o.gapFromFirst}</td></tr>)}</tbody></table></div></section>
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-[#173a4c] p-4 text-[#f5f0e5]" data-testid="report-participants-of-night"><div className="mono text-[10px] uppercase tracking-[.16em] text-[#df9879]">Participant of the night</div><div className="display mt-1 text-2xl font-bold">{names.length ? names.join(" · ") : "No award"}</div></div>
      <div className="rounded-xl border border-[#ded8ca] p-4" data-testid="report-players-of-night"><div className="mono text-[10px] uppercase tracking-[.16em] text-[#82908c]">Players of the night</div>{r.playersOfNight.length ? <Scoring rows={r.playersOfNight} id="pon" /> : <p className="mt-2 text-sm text-[#7c8783]">No player of the night.</p>}</div>
    </section>
    <section><H>Owner reports</H><div className="grid gap-4 md:grid-cols-2">{owners.map((o) => <article key={o.ownerId} className="rounded-xl border border-[#ded8ca] p-4" data-testid={`report-owner-${o.ownerId}`}>
      <div className="flex items-start justify-between gap-3"><div><div className="mono text-[10px] uppercase tracking-[.16em] text-[#82908c]">Rank {o.rank}{o.tied ? " tied" : ""}</div><div className="display text-2xl font-bold text-[#173a4c]">{o.ownerName}</div></div><div className="text-right"><div className="display text-3xl font-bold text-[#c65c3e]">{o.dailyPoints}</div><div className="mono text-[10px] uppercase text-[#82908c]">Season {o.seasonPoints}</div></div></div>
      <div className="mono mt-2 flex flex-wrap gap-x-4 text-[11px] text-[#788480]"><span>Move <Mv v={o.movement} /></span><span>Behind first {o.gapFromFirst}</span><span>Active players {o.activePlayers == null ? "unknown" : o.activePlayers}</span></div>
      <p className="mt-3 text-sm leading-6 text-[#55696f]">{o.narrative}</p>
      {o.scoring.length > 0 && <div className="mt-2"><Scoring rows={o.scoring} id={`o${o.ownerId}`} /></div>}
    </article>)}</div></section>
    <section><H>Daily player leaderboard</H>{r.dailyLeaders.length ? <Scoring rows={r.dailyLeaders} id="dl" /> : <p className="text-sm text-[#7c8783]">No player scoring.</p>}</section>
    <section><H>Season leaders</H><p className="-mt-2 mb-3 text-xs text-[#788480]">Points are earned while on that owner's roster. Season ref. is the player's full-season Pool Points, for reference only.</p>{r.seasonLeaders.length ? <ol className="divide-y divide-[#e5dfd3]" data-testid="report-season-leaders">{r.seasonLeaders.map((p, i) => <li key={p.playerId} className="flex justify-between gap-3 py-2 text-sm"><span><span className="mono mr-2 text-[#82908c]">{i + 1}</span><b className="text-[#254456]">{p.playerName}</b> <span className="mono text-[10px] text-[#82908c]">{p.team} · {p.ownerName}</span></span><span className="mono text-right font-semibold">{p.poolPoints} points<SeasonRef className="block font-normal" value={refs.byPlayer((p as unknown as { ownerId?: string }).ownerId ?? "", p.playerId)} /></span></li>)}</ol> : <p className="text-sm text-[#7c8783]">No season leaders listed.</p>}</section>
    <section className="grid gap-4 md:grid-cols-2">
      <div><H>Biggest risers</H>{risers.length ? risers.map((o) => <div key={o.ownerId} className="flex justify-between py-1 text-sm"><span>{o.ownerName}</span><Mv v={o.movement} /></div>) : <p className="text-sm text-[#7c8783]">No risers.</p>}</div>
      <div><H>Biggest fallers</H>{fallers.length ? fallers.map((o) => <div key={o.ownerId} className="flex justify-between py-1 text-sm"><span>{o.ownerName}</span><Mv v={o.movement} /></div>) : <p className="text-sm text-[#7c8783]">No fallers.</p>}</div>
    </section>
    <section data-testid="report-races"><H>The race</H><p className="text-sm leading-6 text-[#55696f]">{r.raceNarrative}</p>
      <div className="mono mt-3 flex flex-wrap gap-x-6 text-xs text-[#53666e]"><span>Gap, top three: {r.topThreeGap == null ? "unknown" : r.topThreeGap}</span><span>Gap, top five: {r.topFiveGap == null ? "unknown" : r.topFiveGap}</span></div>
      <ul className="mt-3 space-y-1">{r.closestRaces.length ? r.closestRaces.map((c, i) => <li key={i} className="flex justify-between rounded-lg bg-[#f1ede3] px-3 py-2 text-sm"><span>{c.participants.join(" vs ")}</span><span className="mono font-semibold">{c.gap} pts apart</span></li>) : <li className="text-sm text-[#7c8783]">No close races listed.</li>}</ul></section>
  </div>;
}

export function DailyReportSection() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const today = useTorontoToday();
  const date = picked ?? today;
  const uid = useId();
  const opts = { staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: POOL_REFRESH_INTERVAL_MS, refetchOnMount: true as const, enabled: open };
  const hist = useGetDailyReportHistory({ query: { ...opts, queryKey: getGetDailyReportHistoryQueryKey() } });
  const q = useGetPublishedDailyReport(date, { query: { ...opts, queryKey: getGetPublishedDailyReportQueryKey(date) } });
  const dates = useMemo(() => { const s = new Set<string>([today]); (hist.data ?? []).forEach((h) => s.add(h.reportDate)); return [...s].sort().reverse(); }, [hist.data, today]);
  const d = q.data;
  return <section className="mb-6 overflow-hidden rounded-2xl border border-[#173a4c] bg-[#faf8f1]" data-testid="daily-report-section" onKeyDown={(e) => { if (e.key === "Escape" && open) setOpen(false); }}>
    <button type="button" aria-expanded={open} aria-controls={`${uid}-panel`} onClick={() => setOpen(!open)} data-testid="button-daily-report-toggle" className="flex min-h-16 w-full items-center justify-between gap-4 bg-[#173a4c] px-5 py-4 text-left text-[#f5f0e5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e57955]">
      <span className="flex items-center gap-3"><FileText className="h-5 w-5 text-[#e48a67]" aria-hidden="true" /><span><span className="mono block text-[10px] uppercase tracking-[.18em] text-[#df9879]">Daily · 8:00 AM Toronto</span><span className="display text-2xl font-bold">Daily report</span></span></span>
      <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div id={`${uid}-panel`} role="region" aria-label="Daily report" className="space-y-5 p-5" data-testid="daily-report-panel">
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#53666e]">Report
        <select value={date} onChange={(e) => setPicked(e.target.value === today ? null : e.target.value)} className="min-h-11 rounded-lg border border-[#d8d1c3] bg-[#f5f1e7] px-3 text-sm text-[#203443]" data-testid="select-report-date">
          {dates.map((x) => <option key={x} value={x}>{x}{x === today ? " (today)" : ""}</option>)}
        </select>
        {hist.isError && <button type="button" onClick={() => hist.refetch()} className="underline" data-testid="button-retry-report-history">History unavailable. Retry</button>}
      </label>
      {q.isLoading ? <div role="status" aria-busy="true" className="space-y-3" data-testid="report-loading">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[#ebe6db]" />)}</div>
        : q.isError || !d ? <div role="alert" className={`${panel} p-4`} data-testid="report-error"><p className="flex items-center gap-2 text-sm text-[#a34e39]"><AlertCircle className="h-5 w-5" />Could not load the report for {date}.</p><button type="button" onClick={() => q.refetch()} data-testid="button-retry-report" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#173a4c] px-4 text-sm font-semibold text-[#f5f0e5]"><RefreshCw className="h-4 w-4" />Retry</button></div>
        : d.status === "published" && d.report ? <Body r={d.report} />
        : <div className={`${panel} border-l-4 border-l-[#c65c3e] p-4`} data-testid={`report-status-${d.status}`}>{d.status === "unavailable" ? <ServerOff className="mb-2 h-4 w-4 text-[#c65c3e]" /> : <Clock3 className="mb-2 h-4 w-4 text-[#c65c3e]" />}<div className="mono text-[10px] uppercase tracking-[.16em] text-[#82908c]">{date} · {d.status}</div><p className="mt-1 text-sm leading-6 text-[#55696f]">{d.message}</p><button type="button" onClick={() => q.refetch()} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#15566d]"><RefreshCw className="h-4 w-4" />Check again</button></div>}
    </div>}
  </section>;
}
