import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';
import { DailyReportHealthNotice } from './daily-report-health';
import {
  useGetAdminManagement, useManagePool, getGetAdminManagementQueryKey, useGetAvailablePlayers, getGetAvailablePlayersQueryKey,
  type PoolManagementInput, type DraftRoster, type Transaction, type AvailablePlayer,
} from '@workspace/api-client-react';

type Account = { ownerId: string; email: string | null; clerkUserId: string | null; disabled: boolean; transactionLimit: number | null; countAdjustment: number | null };
type Audit = { id: string | number; action: string; reason: string; actor: string | null; createdAt: string; details?: unknown };
type Action = PoolManagementInput['action'];
type Draft = { action: Action; title: string; summary: string; details: Record<string, unknown> };

const toronto = (v?: string | null) => v ? new Date(v).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'America/Toronto' }) : '—';
const btn = 'min-h-11 rounded-lg border border-[#d1b9a5] bg-[#f6e3d8] px-3 text-xs font-bold text-[#8a3d27] hover:bg-[#f0d3c4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]';
const input = 'min-h-11 rounded-lg border border-[#d8d1c3] bg-[#f6f3ea] px-3 text-sm text-[#203443]';

function Block({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="mt-5 rounded-2xl border border-[#ded8ca] bg-[#faf8f1]"><div className="border-b border-[#e1dccf] p-5"><h2 className="display text-2xl font-bold text-[#173a4c]">{title}</h2>{note && <p className="mt-1 text-sm text-[#67767c]">{note}</p>}</div><div className="p-5">{children}</div></section>;
}

export function integrity(r: DraftRoster) {
  const a = r.selections.filter(s => !s.droppedAt);
  const F = a.filter(s => s.assetType === 'skater' && s.position === 'F').length;
  const D = a.filter(s => s.assetType === 'skater' && s.position === 'D').length;
  const G = a.filter(s => s.assetType === 'goalieTeam').length;
  return { F, D, G, ok: F === 13 && D === 5 && G === 2 };
}

/** Review + reason + confirm modal; one stable requestId per draft, reused on retry. */
function ReviewDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const client = useQueryClient();
  const m = useManagePool();
  const [reason, setReason] = useState('');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const valid = reason.trim().length >= 3 && ok;
  async function go() {
    setErr('');
    try {
      await m.mutateAsync({ data: { action: draft.action, reason: reason.trim(), requestId: requestId.current, details: draft.details } });
      setDone(true);
      await client.invalidateQueries();
    } catch (e) { setErr(`${e instanceof Error ? e.message : 'The change could not be confirmed.'} If unsure, retry: the same request ID prevents a duplicate.`); }
  }
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#173a4c]/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="mgmt-title" data-testid="dialog-admin-review">
    <div className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#d9d2c4] bg-[#faf8f1] p-5 sm:rounded-2xl">
      <h3 id="mgmt-title" className="display text-2xl font-bold text-[#173a4c]">{done ? 'Change recorded' : `Review: ${draft.title}`}</h3>
      {done ? <><p className="mt-3 text-sm text-[#2f6a55]" role="status">Saved and written to the audit log. Data refreshed.</p><button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-lg bg-[#173a4c] px-4 text-sm font-bold text-[#f5f0e5]" data-testid="button-admin-done">Done</button></>
        : <>
          <p className="mt-2 text-sm leading-6 text-[#53666e]">{draft.summary}</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-[#f0ece1] p-3 text-xs text-[#254456]">{JSON.stringify(draft.details, null, 2)}</pre>
          <label className="mt-3 block text-sm font-semibold text-[#254456]">Reason (required, min 3 characters)<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000} className={`${input} mt-1 w-full py-2`} data-testid="input-admin-reason" /></label>
          <label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-[#254456]"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-1 h-5 w-5 accent-[#14546a]" data-testid="checkbox-admin-confirm" />I reviewed this change and want it recorded in the audit log.</label>
          {err && <p role="alert" className="mt-3 text-sm text-[#9b4330]">{err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={m.isPending} className="min-h-11 rounded-lg border border-[#d9d2c4] px-4 text-sm font-semibold text-[#173a4c]" data-testid="button-admin-cancel">Cancel</button>
            <button type="button" onClick={() => void go()} disabled={!valid || m.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173a4c] px-4 text-sm font-bold text-[#f5f0e5] disabled:opacity-50" data-testid="button-admin-submit">{m.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}Confirm change</button>
          </div></>}
    </div>
  </div>;
}


type Game = { gameId: number; label: string };
/** Finds saved games ({gameId, matchup?, gameDate?}) anywhere inside a transaction's details. */
function savedGames(d: unknown, out: Game[] = [], depth = 0): Game[] {
  if (!d || typeof d !== 'object' || depth > 5) return out;
  if (Array.isArray(d)) { d.forEach(x => savedGames(x, out, depth + 1)); return out; }
  const o = d as Record<string, unknown>;
  const id = Number(o.gameId);
  if (o.gameId != null && Number.isInteger(id) && !out.some(g => g.gameId === id)) out.push({ gameId: id, label: [o.matchup, o.gameDate].filter(x => typeof x === 'string').join(' · ') || `Game ${id}` });
  Object.values(o).forEach(v => savedGames(v, out, depth + 1));
  return out;
}
const sel = (r: DraftRoster['selections'][number]) => r.confirmedName ?? r.originalText;
const txLabel = (t: Transaction) => `${t.ownerName}: ${t.outgoingPlayerName ?? '—'} → ${t.incomingPlayerName ?? '—'} (${toronto(t.createdAt)})`;

function PlayerPicker({ group, value, onChange }: { group: 'F' | 'D' | null; value: string; onChange: (v: string) => void }) {
  const av = useGetAvailablePlayers({ query: { queryKey: getGetAvailablePlayersQueryKey(), staleTime: 30000 } });
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    // Pending season-stat reference is allowed; scoringStatus is deliberately NOT used to filter.
    return (av.data?.rows ?? []).filter((r: AvailablePlayer) => r.position !== 'G' && (!group || (group === 'D') === (r.position === 'D')) && (!n || `${r.name} ${r.team ?? ''}`.toLowerCase().includes(n))).slice(0, 80);
  }, [av.data, q, group]);
  return <div className="flex flex-col gap-1 text-xs font-semibold">Undrafted player
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or team" aria-label="Search Undrafted players" className={`${input} w-56`} data-testid="input-picker-search" />
    <select value={value} onChange={e => onChange(e.target.value)} className={`${input} w-56`} aria-label="Undrafted player" data-testid="select-picker-player">
      <option value="">{av.isLoading ? 'Loading…' : av.isError ? 'Could not load players' : 'Choose a player'}</option>
      {rows.map(r => <option key={r.nhlPlayerId} value={r.nhlPlayerId}>{r.name} · {r.team ?? '?'} · {r.position}</option>)}
    </select></div>;
}

function AccountRow({ a, name, open }: { a: Account | undefined; name: string; open: (d: Draft) => void }) {
  const ownerId = a?.ownerId ?? '';
  const [email, setEmail] = useState(a?.email ?? '');
  const [limit, setLimit] = useState(String(a?.transactionLimit ?? 9));
  const [adj, setAdj] = useState(String(a?.countAdjustment ?? 0));
  const lim = Number(limit), ad = Number(adj);
  const allowOk = Number.isInteger(lim) && lim >= 0 && lim <= 99 && Number.isInteger(ad) && ad >= -99 && ad <= 99;
  return <li className="rounded-xl border border-[#e5dfd3] p-4" data-testid={`admin-account-${ownerId}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-[#254456]">{name}</b><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${a?.disabled ? 'bg-[#f8e5df] text-[#9b4330]' : 'bg-[#e2efe5] text-[#2f6a55]'}`}>{a?.disabled ? 'Disabled' : a?.clerkUserId ? 'Linked' : 'Not linked'}</span></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-[#53666e]">Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" className={`${input} mt-1 block w-60 max-w-full`} data-testid={`input-admin-email-${ownerId}`} /></label>
        <button type="button" className={btn} onClick={() => open({ action: 'account', title: `Account for ${name}`, summary: 'Updates the email link and enabled state. Clearing the email unlinks it.', details: { ownerId, email: email.trim() || null, disabled: !!a?.disabled } })}>Save email</button>
        <button type="button" className={btn} onClick={() => open({ action: 'account', title: `${a?.disabled ? 'Enable' : 'Disable'} ${name}`, summary: a?.disabled ? 'Re-enables self-service transactions.' : 'Blocks this participant from making transactions.', details: { ownerId, email: a?.email ?? null, disabled: !a?.disabled } })} data-testid={`button-admin-toggle-${ownerId}`}>{a?.disabled ? 'Enable' : 'Disable'}</button>
        <button type="button" className={btn} disabled={!a?.email} onClick={() => open({ action: 'invitation', title: `Send invitation to ${name}`, summary: `A secure Clerk invitation email will be sent to ${a?.email}. Nothing is sent until you confirm.`, details: { ownerId } })} data-testid={`button-admin-invite-${ownerId}`}>Send invitation</button></div>
      <div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-[#53666e]">Limit (0–99)<input value={limit} onChange={e => setLimit(e.target.value)} inputMode="numeric" className={`${input} mt-1 block w-24`} /></label><label className="text-xs font-semibold text-[#53666e]">Adjust (−99–99)<input value={adj} onChange={e => setAdj(e.target.value)} inputMode="numeric" className={`${input} mt-1 block w-24`} /></label>
        <button type="button" className={btn} disabled={!allowOk} onClick={() => open({ action: 'allowance', title: `Allowance for ${name}`, summary: 'Changes the allowance only. It does not change fees.', details: { ownerId, transactionLimit: lim, countAdjustment: ad } })}>Save allowance</button></div>
    </div>
  </li>;
}

export function AdminManagement() {
  const q = useGetAdminManagement({ query: { queryKey: getGetAdminManagementQueryKey(), refetchOnMount: 'always', staleTime: 0 } });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rOwner, setROwner] = useState(''); const [rOp, setROp] = useState<'add' | 'remove' | 'correct'>('add');
  const [rRound, setRRound] = useState(''); const [rId, setRId] = useState(''); const [rTeam, setRTeam] = useState('');
  const [eTx, setETx] = useState(''); const [eGame, setEGame] = useState(''); const [eVal, setEVal] = useState<'true' | 'false'>('true');
  const [eManual, setEManual] = useState(false); const [eOwner, setEOwner] = useState(''); const [eRound, setERound] = useState(''); const [eGameId, setEGameId] = useState('');
  const [revId, setRevId] = useState('');
  const accounts = useMemo(() => (q.data?.accounts ?? []) as unknown as Account[], [q.data]);
  const audit = (q.data?.audit ?? []) as unknown as Audit[];
  const rosters = q.data?.rosters ?? [];
  const txs = q.data?.transactions ?? [];

  if (q.isLoading) return <><DailyReportHealthNotice /><div className="mt-5 space-y-2" aria-busy="true" role="status"><div className="h-14 animate-pulse rounded-xl bg-[#e7e2d6]" /><div className="h-40 animate-pulse rounded-xl bg-[#ebe6db]" /></div></>;
  if (q.isError) return <><DailyReportHealthNotice /><p role="alert" className="mt-5 rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-4 text-sm text-[#874838]">Admin management is unavailable (the service may still be updating). <button type="button" onClick={() => q.refetch()} className="font-bold underline">Retry</button></p></>;
  const nameOf = (id: string) => rosters.find(r => r.id === id)?.name ?? id;
  const ownerSel = rosters.find(r => r.id === rOwner)?.selections ?? [];
  const roundSel = ownerSel.filter(x => String(x.round) === rRound);
  const activeSel = roundSel.find(x => !x.droppedAt);
  const rounds = [...new Set(ownerSel.filter(x => (rOp === 'add' ? !x.droppedAt === false || !ownerSel.some(y => y.round === x.round && !y.droppedAt) : !x.droppedAt)).map(x => x.round))].sort((x, y) => x - y);
  const roundGroup: 'F' | 'D' | null = roundSel[0]?.assetType === 'goalieTeam' ? null : (roundSel[0]?.position === 'D' ? 'D' : roundSel[0] ? 'F' : null);
  const isGoalieRound = roundSel[0]?.assetType === 'goalieTeam';
  const rosterDetails: Record<string, unknown> = { ownerId: rOwner, operation: rOp };
  if (rRound) rosterDetails.round = Number(rRound);
  if (rId) rosterDetails.nhlPlayerId = Number(rId);
  if (rTeam.trim()) rosterDetails.goalieTeam = rTeam.trim().toUpperCase();
  const rosterOk = !!rOwner && !!rRound && (rOp === 'add' ? !!rId : rOp === 'remove' ? true : (!!rId || !!rTeam.trim()));
  const liveTx = txs.filter(t => !t.reversedAt);
  const tx = liveTx.find(t => t.id === eTx);
  const txRound = tx ? rosters.find(r => r.id === tx.ownerId)?.selections.find(x => x.nhlPlayerId != null && String(x.nhlPlayerId) === tx.incomingPlayerId)?.round : undefined;
  const games = tx ? savedGames(tx.details) : [];
  const eligDetails = eManual ? { ownerId: eOwner, round: Number(eRound), gameId: Number(eGameId), eligible: eVal === 'true' } : { ownerId: tx?.ownerId ?? '', round: txRound ?? 0, gameId: Number(eGame), eligible: eVal === 'true' };
  const eligOk = eManual ? !!eOwner && Number.isInteger(Number(eRound)) && Number(eRound) > 0 && Number.isInteger(Number(eGameId)) && Number(eGameId) > 0 : !!tx && !!txRound && !!eGame;

  return <div data-testid="panel-admin-management">
    <DailyReportHealthNotice />
    {draft && <ReviewDialog draft={draft} onClose={() => setDraft(null)} />}
    <Block title="Participant accounts" note="Every change needs a reason, a review and an explicit confirmation, and is audited. Invitations are only sent on your click."><ul className="space-y-3">{(accounts.length ? accounts : rosters.map(r => ({ ownerId: r.id, email: null, clerkUserId: null, disabled: false, transactionLimit: 9, countAdjustment: 0 }))).map(a => <AccountRow key={`${a.ownerId}-${a.email}-${a.disabled}-${a.transactionLimit}-${a.countAdjustment}`} a={a} name={nameOf(a.ownerId)} open={setDraft} />)}</ul></Block>

    <Block title="Roster integrity" note="Every complete roster is 13 forwards, 5 defencemen and 2 goalie teams. Incomplete rosters block normal swaps.">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rosters.map(r => { const i = integrity(r); return <li key={r.id} className={`rounded-xl border p-3 text-sm ${i.ok ? 'border-[#cfe0d3] bg-[#eef4ee]' : 'border-[#e3b8aa] bg-[#fbede7]'}`} data-testid={`integrity-${r.id}`}><b>{r.name}</b><div className="mono text-xs">{i.F}F · {i.D}D · {i.G}G — {i.ok ? 'complete' : 'INCOMPLETE: normal swaps blocked'}</div></li>; })}</ul>
      <h3 className="mt-5 text-sm font-bold text-[#254456]">Roster correction</h3>
      <p className="text-xs text-[#67767c]">Add picks a current Undrafted player and starts at 0. Remove freezes credits with no fee. Correct fixes an official identity; goalie team corrections use an NHL abbreviation. Participants can never edit goalies.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold">Owner<select value={rOwner} onChange={e => { setROwner(e.target.value); setRRound(''); setRId(''); setRTeam(''); }} className={`${input} mt-1 block`} data-testid="select-roster-owner"><option value="">Choose</option>{rosters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Operation<select value={rOp} onChange={e => { setROp(e.target.value as typeof rOp); setRRound(''); setRId(''); setRTeam(''); }} className={`${input} mt-1 block`}><option value="add">Add</option><option value="remove">Remove</option><option value="correct">Correct</option></select></label>
        <label className="text-xs font-semibold">Round<select value={rRound} onChange={e => { setRRound(e.target.value); setRId(''); setRTeam(''); }} disabled={!rOwner} className={`${input} mt-1 block`} data-testid="select-roster-round"><option value="">{rOwner ? 'Choose' : 'Pick an owner first'}</option>{rounds.map(n => { const cur = ownerSel.find(x => x.round === n && !x.droppedAt); return <option key={n} value={n}>Round {n} · {cur ? `${sel(cur)} (${cur.assetType === 'goalieTeam' ? 'G' : cur.position})` : 'open slot'}</option>; })}</select></label>
        {rOp !== 'remove' && rRound && !isGoalieRound && <PlayerPicker group={roundGroup} value={rId} onChange={setRId} />}
        {rOp !== 'remove' && rRound && isGoalieRound && <label className="text-xs font-semibold">Goalie team abbreviation<input value={rTeam} onChange={e => setRTeam(e.target.value)} maxLength={3} placeholder="e.g. TOR" className={`${input} mt-1 block w-28 uppercase`} /></label>}
        <button type="button" className={btn} disabled={!rosterOk} onClick={() => setDraft({ action: 'roster', title: `Roster ${rOp} for ${nameOf(rOwner)}`, summary: `${rOp === 'add' ? 'Adds' : rOp === 'remove' ? `Removes ${activeSel ? sel(activeSel) : 'the current player'} from` : 'Corrects the identity in'} round ${rRound}. May leave the roster temporarily incomplete, which blocks normal swaps until it is 13F/5D/2G again.`, details: rosterDetails })} data-testid="button-roster-review">Review</button>
      </div>
    </Block>

    <Block title="Eligibility exception" note="Pick a saved transaction, then one of its saved games, and say whether it counts. Audited.">
      {!eManual ? <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold">Saved transaction<select value={eTx} onChange={e => { setETx(e.target.value); setEGame(''); }} className={`${input} mt-1 block w-80 max-w-full`} data-testid="select-elig-tx"><option value="">{liveTx.length ? 'Choose' : 'No current transactions'}</option>{liveTx.map(t => <option key={t.id} value={t.id}>{txLabel(t)}</option>)}</select></label>
        {tx && <label className="text-xs font-semibold">Game<select value={eGame} onChange={e => setEGame(e.target.value)} className={`${input} mt-1 block w-64 max-w-full`} data-testid="select-elig-game"><option value="">{games.length ? 'Choose a saved game' : 'No saved games on this transaction'}</option>{games.map(g => <option key={g.gameId} value={g.gameId}>{g.label}</option>)}</select></label>}
        <label className="text-xs font-semibold">Decision<select value={eVal} onChange={e => setEVal(e.target.value as 'true' | 'false')} className={`${input} mt-1 block`}><option value="true">Counts</option><option value="false">Does not count</option></select></label>
        <button type="button" className={btn} disabled={!eligOk} onClick={() => setDraft({ action: 'eligibility', title: 'Eligibility exception', summary: `${games.find(g => g.gameId === Number(eGame))?.label ?? `Game ${eGame}`} will ${eVal === 'true' ? 'count' : 'not count'} for ${tx?.ownerName}, round ${txRound}.`, details: eligDetails })} data-testid="button-elig-review">Review</button>
        {tx && !txRound && <p className="w-full text-xs text-[#9b4330]">The roster round for this pickup could not be found. Use manual entry.</p>}
        <button type="button" onClick={() => setEManual(true)} className="w-full text-left text-xs font-semibold text-[#15566d] underline">Fallback: enter IDs manually</button>
      </div> : <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold">Owner<select value={eOwner} onChange={e => setEOwner(e.target.value)} className={`${input} mt-1 block`}><option value="">Choose</option>{rosters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Round<input value={eRound} onChange={e => setERound(e.target.value)} inputMode="numeric" className={`${input} mt-1 block w-20`} /></label>
        <label className="text-xs font-semibold">Game ID (manual)<input value={eGameId} onChange={e => setEGameId(e.target.value)} inputMode="numeric" className={`${input} mt-1 block w-36`} /></label>
        <label className="text-xs font-semibold">Decision<select value={eVal} onChange={e => setEVal(e.target.value as 'true' | 'false')} className={`${input} mt-1 block`}><option value="true">Counts</option><option value="false">Does not count</option></select></label>
        <button type="button" className={btn} disabled={!eligOk} onClick={() => setDraft({ action: 'eligibility', title: 'Eligibility exception (manual IDs)', summary: `Game ${eGameId} will ${eVal === 'true' ? 'count' : 'not count'} for ${nameOf(eOwner)}, round ${eRound}.`, details: eligDetails })}>Review</button>
        <button type="button" onClick={() => setEManual(false)} className="text-xs font-semibold text-[#15566d] underline">Back to saved transactions</button>
      </div>}
    </Block>

    <Block title="Reverse a transaction" note="Voids the move, restores the original outgoing selection, removes the incoming ownership credit and its fee, count and pot effect. The ledger and audit entry stay. Ownership conflicts are rejected.">
      {liveTx.length === 0 ? <p className="rounded-xl border border-dashed border-[#cfc8b9] p-5 text-center text-sm text-[#7a8582]">No current transactions to reverse.</p> : <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold">Current transaction<select value={revId} onChange={e => setRevId(e.target.value)} className={`${input} mt-1 block w-96 max-w-full`} data-testid="select-reverse-tx"><option value="">Choose</option>{liveTx.map(t => <option key={t.id} value={t.id}>{txLabel(t)}</option>)}</select></label>
        <button type="button" className={btn} disabled={!liveTx.some(x => x.id === revId)} onClick={() => { const t = liveTx.find(x => x.id === revId); if (t) setDraft({ action: 'reverse', title: `Reverse ${t.ownerName}'s move`, summary: `${t.outgoingPlayerName ?? 'Outgoing player'} is restored and ${t.incomingPlayerName ?? 'incoming player'} loses its ownership credit. Fee, count and pot effects are removed.`, details: { id: t.id } }); }} data-testid="button-reverse-review">Review</button>
      </div>}
    </Block>

    <Block title="Audit log" note="Includes payment, rule and administrator changes.">
      {audit.length === 0 ? <p className="rounded-xl border border-dashed border-[#cfc8b9] p-6 text-center text-sm text-[#7a8582]">No audit entries yet.</p> : <ol className="space-y-2" data-testid="list-audit">{audit.map(a => <li key={String(a.id)} className="rounded-lg bg-[#f0ece1] p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><b className="text-[#254456]"><ShieldAlert size={13} className="mr-1 inline" aria-hidden="true" />{a.action}</b><span className="mono text-xs text-[#788480]">{toronto(a.createdAt)} Toronto</span></div><p className="mt-1 text-[#53666e]">{a.reason} · by {a.actor ?? 'unknown'}</p>{a.details != null && <details className="mt-1 text-xs text-[#788480]"><summary className="cursor-pointer">Details</summary><pre className="overflow-x-auto">{JSON.stringify(a.details, null, 2)}</pre></details>}</li>)}</ol>}
    </Block>
  </div>;
}
