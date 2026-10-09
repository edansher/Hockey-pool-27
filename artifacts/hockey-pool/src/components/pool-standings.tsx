import { useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, RefreshCw } from "lucide-react";
import { NhlSourcePanel } from "@/components/nhl-source-panel";
import { StandingsPointsDialog } from "@/components/standings-points-dialog";
import { useStandingsScoringAlerts } from "@/hooks/use-standings-scoring-alerts";
import { POOL_REFRESH_INTERVAL_MS, getGetStandingsQueryKey, useGetStandings, isProvisionalPoolStandings } from "@workspace/api-client-react";

const pending = <span className="mono text-[9px] text-muted-foreground sm:text-xs">Pending</span>;
const val = (v: number | null, d = 0) => (v === null ? pending : d ? v.toFixed(d) : v);

export function PoolStandings({ date, showSource = true }: { date?: string; showSource?: boolean }) {
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "yesterday">("today");
  const pointsTrigger = useRef<HTMLButtonElement | null>(null);
  const params = date ? { date } : undefined;
  const q = useGetStandings(params, {
    query: { queryKey: getGetStandingsQueryKey(params), staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: POOL_REFRESH_INTERVAL_MS, refetchOnMount: true },
  });
  const snap = q.data;
  const selectedOwner = snap?.rows.find((row) => row.id === selectedOwnerId);
  const scoringAlerts = useStandingsScoringAlerts(snap);

  if (q.isLoading)
    return (
      <div data-testid="standings-loading" className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  if (q.isError || !snap)
    return (
      <div data-testid="standings-error" className="rounded-xl border bg-card p-5">
        <h2 className="display text-2xl">Could not load standings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
        <button data-testid="button-retry-standings" onClick={() => q.refetch()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );

  const ranked = snap.rows.some((r) => r.rank !== null);
  const totals = snap.rows.flatMap((r) => r.seasonPoints === null ? [] : [r.seasonPoints]);
  const leaderPoints = totals.length ? Math.max(...totals) : null;
  const pointsBehind = (points: number | null) => points === null || leaderPoints === null ? null : leaderPoints - points;
  const provisional = isProvisionalPoolStandings(snap.reason);
  const confirmedThrough = snap.reason?.startsWith("Standings confirmed through ") && snap.date
    ? new Date(`${snap.date.slice(0, 10)}T12:00:00Z`)
        .toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
    : null;
  return (
    <section data-testid="pool-standings" className="space-y-4">
      <style>{`@keyframes standings-score-flash{0%,100%{opacity:1}50%{opacity:.35}}.standings-score-flash{animation:standings-score-flash 1.5s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.standings-score-flash{animation:none}}`}</style>
      {showSource && <NhlSourcePanel compact />}
      <StandingsPointsDialog owner={selectedOwner} period={selectedPeriod} snapshotDate={snap.date} asOf={snap.asOf} onOpenChange={(open) => { if (!open) setSelectedOwnerId(null); }} onCloseAutoFocus={() => pointsTrigger.current?.focus()} />
      <div data-testid="standings-notice" className="space-y-1 border-l-[3px] border-accent pl-3">
        <span className="mono rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{provisional ? "Live provisional" : snap.status}</span>
        {provisional && <p data-testid="standings-live-provisional" className="mono text-xs font-semibold text-primary">Live scores and ranks · provisional</p>}
        {confirmedThrough && <p data-testid="standings-confirmed-through" className="mono text-xs font-semibold text-primary">Confirmed standings through {confirmedThrough}</p>}
        <p className="text-sm text-muted-foreground">
          {snap.reason ?? (snap.status === "available" ? "Official scoring is connected." : "Scores and ranks await official data.")}
        </p>
        {snap.asOf ? <p data-testid="text-standings-asof" className="mono text-[11px] uppercase text-muted-foreground">As of {new Date(snap.asOf).toLocaleString()}</p> : null}
        {!ranked ? <p className="text-xs text-muted-foreground">Owners are listed alphabetically, not by rank.</p> : null}
      </div>
      {snap.rows.length === 0 ? (
        <div data-testid="standings-empty" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">No owners have been saved for this pool.</div>
      ) : (
        <div className="overflow-x-auto">
         <div className="min-w-[686px] sm:min-w-[944px]">
        <div className="mb-2 flex items-center gap-1.5 px-3 mono text-[9px] font-semibold uppercase tracking-normal text-muted-foreground sm:gap-3 sm:text-[10px] sm:tracking-wider" data-testid="standings-column-headings">
          <span className="w-6 shrink-0 sm:w-9">{provisional ? "Live rank" : "Rank"}</span>
          <span className="min-w-0 flex-1">Participant</span>
          <span className="w-36 shrink-0 sm:w-44"><span className="sr-only">Live scoring alerts</span></span>
          <span className="w-[52px] shrink-0 text-right sm:w-24">Total points</span>
          <span className="w-[60px] shrink-0 text-right sm:w-28">Today’s points</span>
          <span className="w-[60px] shrink-0 text-right sm:w-28">Yesterday’s points</span>
          <span className="w-[60px] shrink-0 text-right sm:w-28">Points behind</span>
          <span className="w-[76px] shrink-0 text-right sm:w-28">Players playing tonight</span>
          <span className="hidden w-5 shrink-0 sm:block" aria-hidden="true" />
        </div>
        <ul className="space-y-2">
          {snap.rows.map((r) => (
            <li key={r.id} className="relative flex min-h-[72px] items-center gap-1.5 rounded-xl border bg-card p-3 transition-opacity active:opacity-80 sm:gap-3">
                <Link href={`/rosters/${r.id}`} data-testid={`link-standing-${r.id}`} aria-label={`Open ${r.name} roster`} className="absolute inset-0 z-0 rounded-xl" />
                <span className="pointer-events-none relative z-10 display w-6 shrink-0 text-2xl text-accent sm:w-9 sm:text-3xl">{r.rank ?? "–"}</span>
                <span className="pointer-events-none relative z-10 min-w-0 flex-1">
                  <span className="display block truncate text-xl font-semibold sm:text-2xl">{r.name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-[10px] text-muted-foreground sm:text-xs">
                    {r.pointsPerGame !== null && <span>{r.pointsPerGame.toFixed(2)}/g</span>}
                    {r.transactionsUsed !== null && <span>{r.transactionsUsed} moves</span>}
                    {!r.rosterComplete && <span>Scoring setup pending</span>}
                  </span>
                </span>
                <span className="pointer-events-none relative z-10 flex w-36 shrink-0 flex-col gap-1 sm:w-44" data-testid={`live-scorers-${r.id}`} aria-live="polite" aria-atomic="true">
                  {scoringAlerts.filter(alert => alert.ownerId === r.id).map(alert => (
                    <span key={alert.id} className="standings-score-flash rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold leading-4 text-amber-950">
                      <span className="block">{alert.playerName}</span>
                      <span className="block text-[10px]">{alert.actions.join(" · ")}</span>
                    </span>
                  ))}
                </span>
                <span className="pointer-events-none relative z-10 w-[52px] shrink-0 text-right sm:w-24" data-testid={`current-score-${r.id}`} aria-label={`Total points: ${r.seasonPoints === null ? "pending" : `${r.seasonPoints} pool points`}`}>
                  <span className="mono text-xl font-bold tabular-nums text-primary sm:text-3xl">{val(r.seasonPoints)}</span>
                </span>
                <button type="button" className={`relative z-10 mono w-[60px] shrink-0 text-right text-base font-semibold tabular-nums sm:w-28 sm:text-xl ${r.livePoints === null || r.todayScorers === undefined ? "pointer-events-none" : "cursor-pointer hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"}`} data-testid={`today-points-${r.id}`} aria-label={`Today’s points: ${r.livePoints ?? "pending"}${r.livePoints !== null && r.todayScorers !== undefined ? ". View verified scoring details" : ""}`} aria-haspopup="dialog" disabled={r.livePoints === null || r.todayScorers === undefined} onClick={(event) => { pointsTrigger.current = event.currentTarget; setSelectedPeriod("today"); setSelectedOwnerId(r.id); }}>{val(r.livePoints)}</button>
                <button type="button" className={`relative z-10 mono w-[60px] shrink-0 text-right text-base font-semibold tabular-nums sm:w-28 sm:text-xl ${r.yesterdayPoints === null || r.yesterdayScorers === undefined ? "pointer-events-none" : "cursor-pointer hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"}`} data-testid={`yesterday-points-${r.id}`} aria-label={`Yesterday’s points: ${r.yesterdayPoints ?? "pending"}${r.yesterdayPoints !== null && r.yesterdayScorers !== undefined ? ". View verified scoring details" : ""}`} aria-haspopup="dialog" disabled={r.yesterdayPoints === null || r.yesterdayScorers === undefined} onClick={(event) => { pointsTrigger.current = event.currentTarget; setSelectedPeriod("yesterday"); setSelectedOwnerId(r.id); }}>{val(r.yesterdayPoints)}</button>
                <span className="pointer-events-none relative z-10 mono w-[60px] shrink-0 text-right text-base font-semibold tabular-nums sm:w-28 sm:text-xl" data-testid={`points-behind-${r.id}`} aria-label={`Points behind: ${pointsBehind(r.seasonPoints) ?? "pending"}`}>{val(pointsBehind(r.seasonPoints))}</span>
                <span className="pointer-events-none relative z-10 mono w-[76px] shrink-0 text-right text-base font-semibold tabular-nums sm:w-28 sm:text-xl" data-testid={`playing-${r.id}`} aria-label={`Players playing tonight: ${r.playing ?? "pending"}`}>{val(r.playing)}</span>
                <ChevronRight className="pointer-events-none relative z-10 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
            </li>
          ))}
        </ul>
        </div>
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">For current standings, today’s points are earned during the Toronto pool day, from 2:00 a.m. through 1:59 a.m. the next day, and update automatically. Historical standings use the explicitly selected date. Yesterday’s points mean points from the prior pool day, which ends at 2:00 a.m. Toronto time—not the previous calendar day. Players playing tonight counts scheduled skaters plus one per scheduled goalie team, regardless of how many named goalies are on the roster; lineups may change.</p>
    </section>
  );
}
