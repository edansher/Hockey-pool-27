import { Fragment, useMemo } from "react";
import { useState } from "react";
import { Ban } from "lucide-react";
import { DropPlayerDialog, useCanManageRoster } from "./participant-drop";
import { Link } from "wouter";
import { PosBadge, PosLegend, posBg, posLabel } from "./position-style";
import type { GetPoolScoringQueryResult } from "@workspace/api-client-react";
import { InjuryStatusPanel, PlayerInjuryBadge, injuryCellStyle, injuryRowStyle, usePlayerInjuries } from "./player-injury-status";
import {
  formatPoolCalendarDate,
  isDraftSelectionVerified,
  needsDraftSelectionConfirmation,
  sortDraftSelections,
  draftSelectionScoringRows,
  buildPoolLeaders,
  POOL_REFRESH_INTERVAL_MS,
  getGetPoolScoringQueryKey,
  useGetPoolScoring,
  useGetDraftRosters,
} from "@workspace/api-client-react";

const card = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-5";

function formatIdentityCheckDate(checkedAt?: string | null) {
  if (!checkedAt) return "check date unavailable";
  const date = new Date(checkedAt);
  return Number.isNaN(date.getTime())
    ? "check date unavailable"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatIdentitySource(source?: string | null) {
  if (source && /\/roster\//i.test(source)) return "official NHL roster";
  if (source && /\/player\//i.test(source)) return "existing NHL identity verified";
  if (!source || /(?:^|[./])nhl(?:e)?\.com(?:\/|$)/i.test(source)) return "NHL.com";
  return source;
}

function formatScoringTimestamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : `${date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Toronto",
    })} Toronto`;
}

function scoringSeason(season: number) {
  const value = String(season);
  return value.length === 8 ? `${value.slice(0, 4)}–${value.slice(6)}` : value;
}

function PoolScoringNotice({ query }: { query: ReturnType<typeof useGetPoolScoring<GetPoolScoringQueryResult>> }) {
  const snapshot = query.data;
  const title = query.isLoading && !snapshot
    ? "Loading official NHL scoring"
    : query.isError && !snapshot
      ? "Could not load NHL scoring"
      : snapshot?.status === "available"
        ? "NHL scoring snapshot · available"
        : snapshot?.status === "partial"
          ? "NHL scoring snapshot · partial coverage"
          : snapshot?.status === "stale"
            ? "NHL scoring snapshot · stale"
            : "NHL scoring snapshot · unavailable";
  const description = snapshot?.reason
    ?? (snapshot?.status === "available"
      ? "Official NHL scoring data is available for this roster."
      : snapshot?.status === "partial"
        ? "Some official NHL scoring values are not available yet."
        : snapshot?.status === "stale"
          ? "Showing the most recent available snapshot; it may be out of date."
          : snapshot?.status === "unavailable"
            ? "Official NHL scoring is not available right now."
            : query.isError
              ? "The scoring snapshot could not be loaded. No values are estimated."
              : "Official NHL player scoring is loading. No values are estimated.");
  return (
    <div data-testid="pool-scoring-source-status" aria-live="polite" className="mb-5 rounded-xl border border-[#d8d1c3] bg-[#f0ece1] p-4 text-sm leading-6 text-[#627177]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-[.13em]">{title}</span>
        {query.isError && <button data-testid="button-retry-pool-scoring" onClick={() => query.refetch()} className="min-h-9 rounded-lg border border-[#c9d5d1] px-3 text-xs font-semibold text-[#15566d]">Retry scoring</button>}
      </div>
      <p className="mt-1">{description}</p>
      {snapshot && <p className="mt-1 text-xs">
        Season {scoringSeason(snapshot.season)}
        {formatScoringTimestamp(snapshot.asOf) ? ` · Snapshot as of ${formatScoringTimestamp(snapshot.asOf)}` : ""}
        {formatPoolCalendarDate(snapshot.coverageThroughDate) ? ` · Coverage through ${formatPoolCalendarDate(snapshot.coverageThroughDate)}` : ""}
      </p>}
      <p className="mt-1 text-xs">NHL standard points are intentionally omitted; Pool points follow this league’s scoring rules.</p>
      {query.isError && snapshot && <p role="status" className="mt-1 text-xs text-[#9c553b]">The latest refresh failed; the last returned snapshot remains visible.</p>}
    </div>
  );
}

function formatPickupTimestamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" })} Toronto`;
}

function DroppedLabel({ droppedAt }: { droppedAt?: string | null }) {
  const when = formatPickupTimestamp(droppedAt);
  return <span data-testid="dropped-label" className="mono mt-1 inline-flex items-center gap-1 rounded-full border border-[#c9c2b3] bg-[#efebe0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6b6757]"><Ban aria-hidden="true" className="h-3 w-3" />Dropped{when ? <span className="font-normal normal-case"> · {when}</span> : null}</span>;
}

const isDropped = (pick: { droppedAt?: string | null }) => !!pick.droppedAt;

function formatStat(value: number | null | undefined, injured = false) {
  return value == null ? <span className={injured ? "text-[#7f1421]" : "text-[#87918e]"}>Pending</span> : value;
}

export function DraftImportSummary() {
  const q = useGetDraftRosters();
  const count = q.data?.reduce((sum, owner) => sum + owner.selections.length, 0);
  return <section className={`${card} flex flex-col justify-between`}>
    <div className="mono text-[10px] uppercase tracking-[.17em] text-[#788480]">Draft boards imported</div>
    <div className="mt-5">
      <div className="display text-6xl font-bold text-[#173a4c]">{count ?? "—"}</div>
      <p className="mt-1 text-sm text-[#627177]">{q.data?.length ?? "—"} participants · original draft selections</p>
    </div>
    <p className="mt-5 rounded-xl bg-[#f0ece1] p-4 text-xs leading-5 text-[#627177]">
      {q.isError ? "The saved draft import could not be loaded." : q.isLoading ? "Loading saved selections…" : "Official NHL pool scoring appears in current standings and each team’s stats. Imported identities are resolved except for any unresolved or conflicting picks flagged for review."}
    </p>
    <Link href="/rosters" className="mt-5 text-sm font-semibold text-[#15566d]">View all participants and picks →</Link>
  </section>;
}

export function DraftOwners() {
  const q = useGetDraftRosters();
  const injuries = usePlayerInjuries();
  const injuryById = useMemo(() => new Map(injuries.data?.players.map(player => [player.nhlPlayerId, player]) ?? []), [injuries.data]);
  const injuryStale = injuries.isError || injuries.data?.status === "stale" || injuries.data?.status === "unavailable";
  if (q.isLoading) return <p role="status">Loading participants and their saved picks…</p>;
  if (q.isError) return <div role="alert" className={card}>Could not load the draft boards. <button className="underline" onClick={() => q.refetch()}>Retry</button></div>;
  if (!q.data?.length) return <p>No draft boards have been imported.</p>;
  return <>
    <div className="mb-5 rounded-xl border border-[#d8d1c3] bg-[#f0ece1] p-4 text-sm leading-6 text-[#627177]">
      All {q.data.reduce((sum, owner) => sum + owner.selections.length, 0)} original selections are saved across {q.data.length} owners. Verified names and teams come from dated NHL.com identity checks; ambiguous matches show possible candidates without selecting one. Original board labels and rounds are preserved. NHL scoring and pool points appear on each roster when official coverage is available.
    </div>
    <div className="mb-5"><InjuryStatusPanel query={injuries} /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {q.data.map(owner => {
        const active = owner.selections.filter(p => !isDropped(p));
        const injured = active.flatMap(pick => {
          if (pick.assetType === "skater") {
            if (!isDraftSelectionVerified(pick) || pick.nhlPlayerId == null) return [];
            const injury = injuryById.get(pick.nhlPlayerId);
            return injury?.status === "injured" ? [injury] : [];
          }
          return (pick.goalies ?? []).flatMap(goalie => {
            const injury = injuryById.get(goalie.nhlPlayerId);
            return injury?.status === "injured" ? [injury] : [];
          });
        });
        return <Link key={owner.id} href={`/rosters/${owner.id}`} className={`${card} block transition hover:border-[#a5bcb4] hover:shadow-md`} data-testid={`card-owner-${owner.id}`}>
        <h2 className="display text-3xl font-bold text-[#173a4c]">{owner.name}</h2>
        <p className="mt-2 text-sm text-[#627177]">{active.length} active picks · {active.filter(p => p.assetType === "skater").length} skaters · {active.filter(p => p.assetType === "goalieTeam").length} goalie slots ({active.reduce((n, p) => n + (p.goalies?.length ?? 0), 0)} confirmed goalies · {active.filter(p => p.assetType === "goalieTeam" && !p.goalies?.length).length} pending names){owner.selections.length > active.length ? ` · ${owner.selections.length - active.length} dropped, kept in totals` : ""}</p>
        {injured.length > 0 && <div className="mt-3 rounded-lg border border-[#e5bcbc] bg-[#fff0ef] p-2.5 text-xs text-[#a01d2c]" data-testid={`owner-injured-list-${owner.id}`}>
          <p className="font-bold" data-testid={`owner-injured-count-${owner.id}`}>{injured.length} injured player{injured.length === 1 ? "" : "s"}{injuryStale ? " · last-known report" : ""}</p>
          <ul className="mt-1 list-disc pl-4">{injured.map(player => <li key={player.nhlPlayerId} data-testid={`owner-injured-player-${owner.id}-${player.nhlPlayerId}`}>{player.name}{player.details ? ` · ${player.details}` : ""}</li>)}</ul>
        </div>}
        <p className="mt-3 text-xs text-[#9c553b]">
          {owner.selections.filter(isDraftSelectionVerified).length} verified names and teams · {owner.selections.filter(needsDraftSelectionConfirmation).length} need confirmation
        </p>
        <span className="mt-4 inline-block text-xs font-semibold text-[#15566d]">Open full roster & picks →</span>
      </Link>;
      })}
    </div>
  </>;
}

export function DraftRosterView({ ownerId }: { ownerId: string }) {
  const q = useGetDraftRosters();
  const injuries = usePlayerInjuries();
  const injuryById = useMemo(() => new Map(injuries.data?.players.map(player => [player.nhlPlayerId, player]) ?? []), [injuries.data]);
  const injuryStale = injuries.isError || injuries.data?.status === "stale" || injuries.data?.status === "unavailable";
  const scoring = useGetPoolScoring({
    query: {
      queryKey: getGetPoolScoringQueryKey(),
      staleTime: POOL_REFRESH_INTERVAL_MS,
      refetchInterval: POOL_REFRESH_INTERVAL_MS,
      refetchOnMount: true,
    },
  });
  const canManage = useCanManageRoster(ownerId);
  const [dropTarget, setDropTarget] = useState<{ nhlPlayerId: number; name: string; position: "F" | "D"; team: string | null } | null>(null);
  if (q.isLoading && !q.data) return <p role="status">Loading saved roster…</p>;
  if (q.isError && !q.data) return <div className={card} role="alert">Could not load this roster. <button className="underline" onClick={() => q.refetch()}>Retry</button></div>;
  const owner = q.data?.find(o => o.id === ownerId);
  if (!owner) return <p>This participant was not found. <Link href="/rosters" className="underline">View all participants</Link></p>;
  const selections = sortDraftSelections(owner.selections);
  const skaters = selections.filter(pick => pick.assetType === "skater" && !isDropped(pick));
  const rows = scoring.data?.rows ?? [];
  const playersByPoints = buildPoolLeaders([owner], scoring.data);
  const slotRows = (pick: typeof selections[number]) => draftSelectionScoringRows(pick, rows, owner.id);
  const allRows = owner.selections.flatMap(slotRows);
  const goalieSlots = selections.filter(pick => pick.assetType === "goalieTeam" && !isDropped(pick));
  const confirmedGoalies = goalieSlots.reduce((n, pick) => n + (pick.goalies?.length ?? 0), 0);
  const pendingSlots = goalieSlots.filter(pick => pick.goalieNamesPending || !pick.goalies?.length).length;
  const ownerTotal = scoring.data?.status !== "unavailable"
    && allRows.length > 0
    && pendingSlots === 0
    && owner.selections.every(pick => slotRows(pick).length > 0)
    && allRows.every(row => row.poolPoints !== null)
    ? allRows.reduce((sum, row) => sum + (row.poolPoints ?? 0), 0)
    : null;
  const statCells = (id: string, key: string, r: typeof rows[number] | undefined, goalie: boolean, injured = false) => ([
    ["goals", r?.goals], ["powerPlayGoals", r?.powerPlayGoals], ["shortHandedGoals", r?.shortHandedGoals], ["assists", r?.assists], ["overtimeGoals", r?.overtimeGoals], ["poolPoints", r?.poolPoints], ["seasonPoolPoints", (r as { seasonPoolPoints?: number | null } | undefined)?.seasonPoolPoints],
  ] as const).map(([field, value], index) => (
    <td key={field} style={injured ? injuryCellStyle : undefined} data-testid={`pool-stat-${id}-${key}-${field}`} className={`w-[90px] min-w-[90px] sm:w-[96px] sm:min-w-[96px] px-3 py-3 text-right align-top mono text-sm tabular-nums ${index === 5 ? `font-semibold ${injured ? "text-[#7f1421]" : "text-[#173a4c]"}` : injured ? "text-[#7f1421]" : "text-[#627177]"}`}>
      {goalie && [1, 2, 4].includes(index) ? <span aria-label="Not applicable">N/A</span> : field === "seasonPoolPoints" && value === undefined ? <span className="text-[#87918e]" title="Season pool points not reported">—</span> : formatStat(value, injured)}
    </td>));
  const mobileTotalPoints = (r: typeof rows[number] | undefined, injured: boolean) => (
    <div className="mt-4 lg:hidden" data-testid="mobile-player-total-points">
      <div className="mono text-[10px] font-semibold uppercase tracking-wide">Total points</div>
      <div aria-label="Total pool points" className={`mono mt-1 text-2xl font-bold tabular-nums ${injured ? "text-[#7f1421]" : "text-[#173a4c]"}`}>{formatStat(r?.poolPoints, injured)}</div>
    </div>
  );
  const renderPick = (pick: typeof selections[number], goalieId?: number | null) => {
    const needsConfirmation = needsDraftSelectionConfirmation(pick);
    const verified = isDraftSelectionVerified(pick);
    const goalie = pick.assetType === "goalieTeam";
    if (goalie) {
      const names = (pick.goalies ?? []).filter(g => goalieId === undefined || g.nhlPlayerId === goalieId);
      const pending = names.length === 0;
      return <Fragment key={`${pick.round}:${pick.nhlPlayerId ?? ""}:${goalieId ?? "pending"}`}>
        {names.map(g => {
          const r = slotRows(pick).find(x => x.nhlPlayerId === g.nhlPlayerId);
          const dropped = isDropped(pick);
          const injury = dropped ? undefined : injuryById.get(g.nhlPlayerId);
          const injured = injury?.status === "injured";
          return <tr key={g.nhlPlayerId} className="border-b border-[#e5dfd3]" style={injured ? injuryRowStyle : posBg("G")} data-injury-status={injury?.status ?? "unknown"} data-injured={injured ? "true" : "false"} data-testid={injured ? `row-injured-${g.nhlPlayerId}` : `draft-goalie-${owner.id}-${pick.round}-${g.nhlPlayerId}`}>
            <td style={injured ? injuryRowStyle : posBg("G")} className={`sm:sticky sm:left-0 sm:z-10 w-[168px] min-w-[168px] sm:w-[240px] sm:min-w-[240px] px-4 py-3 align-top ${injured ? "text-[#7f1421]" : ""}`}>
              <div className={`font-semibold ${injured ? "text-[#7f1421]" : "text-[#254456]"}`}><PosBadge position="G" /><span className={dropped ? "line-through opacity-60" : undefined}>{g.confirmedName}</span></div>
              {dropped && <DroppedLabel droppedAt={pick.droppedAt} />}
              <p className={`mt-1 text-[11px] leading-4 ${injured ? "text-[#7f1421]" : "text-[#788480]"}`}>Original goalie slot: {pick.originalText} · Round {pick.round}</p>
              {pick.goalieNamesPending && <p className="mt-1 text-[11px] text-[#75611e]">Additional goalie identities pending for this slot.</p>}
              <PlayerInjuryBadge injury={injury} stale={injuryStale} />
              <p className={`mt-1 text-[11px] leading-4 ${injured ? "text-[#7f1421]" : "text-[#788480]"}`}>Goalie · W {formatStat(r?.wins, injured)} · SO {formatStat(r?.shutouts, injured)}</p>
              <p className={`mt-1 text-[11px] leading-4 ${injured ? "text-[#7f1421]" : "text-[#42715e]"}`}>NHL-verified · ID {g.nhlPlayerId} · {formatIdentitySource(g.identitySource)}</p>
            </td>
            <td style={injured ? injuryCellStyle : undefined} className={`px-3 py-3 align-top text-sm ${injured ? "text-[#7f1421]" : "text-[#627177]"}`}>{g.confirmedTeam}{mobileTotalPoints(r, injured)}</td>
            {statCells(owner.id, `${pick.round}-${g.nhlPlayerId}`, r, true, injured)}
          </tr>;
        })}
        {pending && <tr className="border-b border-[#e5dfd3]" style={posBg("G")} data-testid={`draft-goalie-pending-${owner.id}-${pick.round}`}>
          <td colSpan={9} className="px-4 py-3 text-xs font-semibold text-[#75611e]">Goalie names pending · original slot {pick.originalText} · Round {pick.round} · points for this slot are unknown, not zero.</td>
        </tr>}
      </Fragment>;
    }
    const stats = slotRows(pick)[0];
    const dropped = isDropped(pick);
    const pickedUpAt = formatPickupTimestamp(pick.acquiredAt);
    const injury = !dropped && isDraftSelectionVerified(pick) && pick.nhlPlayerId != null ? injuryById.get(pick.nhlPlayerId) : undefined;
    const injured = injury?.status === "injured";
    return <Fragment key={`${pick.round}:${pick.nhlPlayerId ?? "x"}`}>
      <tr data-dropped={dropped ? "true" : "false"} data-testid={injured && pick.nhlPlayerId != null ? `row-injured-${pick.nhlPlayerId}` : `draft-pick-${owner.id}-${pick.round}${pick.nhlPlayerId != null ? `-${pick.nhlPlayerId}` : ""}`} data-injury-status={injury?.status ?? "unknown"} data-injured={injured ? "true" : "false"} style={injured ? injuryRowStyle : posBg(pick.position)} className="border-b border-[#e5dfd3] last:border-0">
        <td style={injured ? injuryRowStyle : posBg(pick.position)} className={`sm:sticky sm:left-0 sm:z-10 w-[168px] min-w-[168px] sm:w-[240px] sm:min-w-[240px] px-4 py-3 align-top ${injured ? "text-[#7f1421]" : ""}`}>
          <div data-testid={`draft-player-${owner.id}-${pick.round}`} className={`font-semibold ${injured ? "text-[#7f1421]" : "text-[#254456]"}`}><PosBadge position={pick.position} /><span className={dropped ? "line-through opacity-60" : undefined}>{pick.confirmedName || pick.originalText}</span></div>
          {dropped && <DroppedLabel droppedAt={pick.droppedAt} />}
          {canManage && !dropped && pick.nhlPlayerId != null && (pick.position === "F" || pick.position === "D") && <button type="button" onClick={() => setDropTarget({ nhlPlayerId: pick.nhlPlayerId as number, name: pick.confirmedName || pick.originalText, position: pick.position as "F" | "D", team: pick.confirmedTeam ?? null })} className="mt-2 min-h-11 rounded-lg border border-[#d1b9a5] bg-[#f6e3d8] px-3 text-xs font-bold text-[#8a3d27] hover:bg-[#f0d3c4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]" data-testid={`button-drop-${pick.nhlPlayerId}`}>Drop Player</button>}
          {!dropped && pick.acquiredAt && <p data-testid={`picked-up-${pick.nhlPlayerId ?? pick.round}`} className="mt-1 text-[11px] leading-4 font-semibold text-[#15566d]">{pickedUpAt ? `Picked up ${pickedUpAt} · points earned since pickup` : "Picked up · points earned since pickup"}</p>}
          <PlayerInjuryBadge injury={injury} stale={injuryStale} />
          <p className={`mt-1 text-[11px] leading-4 ${injured ? "text-[#7f1421]" : "text-[#788480]"}`}>Original board label: {pick.originalText} · Round {pick.round}</p>
          {verified && <p className={`mt-1 text-[11px] leading-4 ${injured ? "text-[#7f1421]" : "text-[#42715e]"}`}>Source: {formatIdentitySource(pick.identitySource)} · checked {formatIdentityCheckDate(pick.identityCheckedAt)}</p>}
          {needsConfirmation && <div className="mt-2 rounded-lg border border-[#e3c98e] bg-[#f8f0d8] p-2 text-[11px] leading-4 text-[#75611e]">
            <p className="font-semibold">Needs confirmation · possible matches, not selected</p>
            {pick.identityCandidates?.length
              ? <ul className="mt-1 list-disc pl-4">{pick.identityCandidates.map(candidate => <li key={candidate.nhlPlayerId}>{candidate.name} · {candidate.team} · {posLabel(candidate.position)}</li>)}</ul>
              : <p className="mt-1">No candidate match is available for review.</p>}
          </div>}
          {pick.reviewNote && <p className="mt-1 text-[11px] leading-4 text-[#a34e39]">{pick.reviewNote}</p>}
        </td>
        <td style={injured ? injuryCellStyle : undefined} data-testid={`draft-team-${owner.id}-${pick.round}`} className={`w-[180px] min-w-[180px] px-3 py-3 align-top text-sm ${injured ? "text-[#7f1421]" : "text-[#627177]"}`}>{pick.confirmedTeam ?? "—"}{mobileTotalPoints(stats, injured)}</td>
        {statCells(owner.id, String(pick.round), stats, false, injured)}
      </tr>
    </Fragment>;
  };
  return <section className={card}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="display text-4xl font-bold text-[#173a4c]">{owner.name}</h2><p className="mt-2 text-sm text-[#627177]">{owner.selections.filter(p => !isDropped(p)).length} active picks · {owner.selections.filter(isDropped).length} dropped · {skaters.length} skaters · {confirmedGoalies} confirmed goalies · {pendingSlots} pending goalie-name slots</p></div>
      <span className="rounded-full bg-[#e6eee8] px-3 py-2 text-xs font-semibold text-[#42715e]">Draft board imported</span>
    </div>
    <InjuryStatusPanel query={injuries} />
    <PoolScoringNotice query={scoring} />
    <PosLegend />
    <div className="overflow-x-auto rounded-xl border border-[#e5dfd3]" data-testid="roster-scoring-table-scroll">
      <table className="w-full min-w-[978px] sm:min-w-[1092px] border-collapse text-left">
        <thead className="bg-[#f0ece1]">
          <tr className="text-[10px] uppercase tracking-[.1em] text-[#788480]">
            <th scope="col" className="sm:sticky sm:left-0 sm:z-20 w-[168px] min-w-[168px] sm:w-[240px] sm:min-w-[240px] bg-[#f0ece1] px-4 py-3 font-semibold">Player</th>
            <th scope="col" className="w-[180px] min-w-[180px] px-3 py-3 font-semibold">NHL team</th>
            {["Goals", "PP goals", "Short-handed goals", "Assists", "OT goals", "Pool points", "Season pool points (ref.)"].map(label => <th key={label} scope="col" className="w-[90px] min-w-[90px] sm:w-[96px] sm:min-w-[96px] px-3 py-3 text-right font-semibold">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr><th scope="rowgroup" colSpan={9} className="bg-[#faf8f1] px-4 py-2 text-left text-xs font-semibold text-[#254456]">Draft picks · highest pool points first · updates automatically · pending scores last</th></tr>
          {playersByPoints.map(player => {
            const pick = selections.find(selection => selection.round === player.round && (player.assetType === "goalie" || selection.nhlPlayerId == null || player.nhlPlayerId == null || selection.nhlPlayerId === player.nhlPlayerId));
            return pick ? renderPick(pick, player.assetType === "goalie" ? player.nhlPlayerId : undefined) : null;
          })}
        </tbody>
        <tfoot className="border-t border-[#d8d1c3] bg-[#f0ece1]">
          <tr><th colSpan={6} className="px-4 py-3 text-left text-sm font-semibold text-[#254456]">Owner roster pool total {ownerTotal === null && <span className="ml-2 text-xs font-normal text-[#788480]">{pendingSlots > 0 ? `${pendingSlots} goalie-name slot${pendingSlots === 1 ? "" : "s"} pending — incomplete` : "Complete scoring rows are not available for every player"}</span>}</th><td colSpan={3} className="mono px-3 py-3 text-right font-semibold tabular-nums text-[#173a4c]">{ownerTotal === null ? "Pending" : ownerTotal}</td></tr>
        </tfoot>
      </table>
    </div>
    {dropTarget && <DropPlayerDialog ownerId={owner.id} outgoing={dropTarget} onClose={() => setDropTarget(null)} />}
    <p className="mt-2 text-xs text-[#788480]">The table scrolls sideways to see all stat columns. Missing values remain Pending, and goalie PP/SH/OT categories are N/A. Goalies score 3 per assist and 10 per goal.</p>
  </section>;
}