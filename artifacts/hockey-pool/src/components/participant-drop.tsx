import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Search, X } from 'lucide-react';
import {
  useGetAvailablePlayers, getGetAvailablePlayersQueryKey, useGetParticipantAccess, getGetParticipantAccessQueryKey,
  usePreviewTransaction, useCreateTransaction, type TransactionPreview, type AvailablePlayer,
} from '@workspace/api-client-react';

const TZ = 'America/Toronto';
const fmtSec = (v?: string | null) => v ? new Date(v).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: TZ, timeZoneName: 'short' }) : 'not available';
const str = (o: Record<string, unknown> | undefined, ...keys: string[]) => { for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' || typeof v === 'number') return String(v); } return null; };
const posGroup = (p: string) => (p === 'D' ? 'D' : p === 'G' ? 'G' : 'F');

/** Linked participant (own roster) or verified admin only. Server still enforces. */
export function useCanManageRoster(ownerId: string) {
  const { userId, isLoaded } = useAuth();
  const q = useGetParticipantAccess({ query: { queryKey: [...getGetParticipantAccessQueryKey(), userId], enabled: isLoaded && !!userId, staleTime: 30000 } });
  const a = q.data;
  return !!userId && !!a && a.authenticated && a.authorized && (a.isAdmin || a.ownerId === ownerId);
}

type Outgoing = { nhlPlayerId: number; name: string; position: 'F' | 'D'; team: string | null };

export function DropPlayerDialog({ ownerId, outgoing, onClose }: { ownerId: string; outgoing: Outgoing; onClose: () => void }) {
  const client = useQueryClient();
  const available = useGetAvailablePlayers({ query: { queryKey: getGetAvailablePlayersQueryKey(), staleTime: 30000 } });
  const preview = usePreviewTransaction();
  const [search, setSearch] = useState('');
  const [incoming, setIncoming] = useState<AvailablePlayer | null>(null);
  const [data, setData] = useState<TransactionPreview | null>(null);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(Date.now());
  const keys = useRef(new Map<string, string>());
  const tokenRef = useRef<string | null>(null);
  const previewFn = useRef(preview.mutateAsync); previewFn.current = preview.mutateAsync;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  const rows = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (available.data?.rows ?? []).filter(r => posGroup(r.position) === outgoing.position && (!n || `${r.name} ${r.team ?? ''}`.toLowerCase().includes(n))).slice(0, 60);
  }, [available.data, search, outgoing.position]);

  const body = useCallback((inc: AvailablePlayer) => ({ ownerId, outgoingPlayerId: String(outgoing.nhlPlayerId), incomingPlayerId: String(inc.nhlPlayerId) }), [ownerId, outgoing.nhlPlayerId]);
  const moveKey = incoming ? `${ownerId}:${outgoing.nhlPlayerId}:${incoming.nhlPlayerId}` : '';
  if (moveKey && !keys.current.has(moveKey)) keys.current.set(moveKey, crypto.randomUUID());
  // Stable Idempotency-Key per proposed move; reused on every retry until saved.
  const create = useCreateTransaction({ request: { headers: { 'Idempotency-Key': keys.current.get(moveKey) ?? '' } } });

  const load = useCallback(async (inc: AvailablePlayer, quiet = false) => {
    if (!quiet) setErr('');
    try {
      const p = await previewFn.current({ data: body(inc) });
      if (tokenRef.current !== null && tokenRef.current !== p.eligibilityToken) setAck(false);
      tokenRef.current = p.eligibilityToken;
      setData(p);
    } catch (e) { if (!quiet) setErr(e instanceof Error ? e.message : 'The preview could not be loaded.'); }
  }, [body]);

  function choose(inc: AvailablePlayer) { setIncoming(inc); setData(null); setAck(false); tokenRef.current = null; setUncertain(false); void load(inc); }

  // Poll while confirming; refresh just after the earliest upcoming cutoff.
  useEffect(() => { if (!incoming || done) return; const t = setInterval(() => { setNow(Date.now()); void load(incoming, true); }, 15000); return () => clearInterval(t); }, [incoming, load, done]);
  useEffect(() => {
    if (!incoming || !data || done) return;
    const next = data.games.map(g => g.cutoff ? new Date(g.cutoff).getTime() : 0).filter(t => t > Date.now()).sort((a, b) => a - b)[0];
    if (!next) return;
    const t = setTimeout(() => void load(incoming, true), Math.min(next - Date.now() + 1200, 2147483000));
    return () => clearTimeout(t);
  }, [data, incoming, load, done]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function confirm() {
    if (!incoming || !data || !ack || create.isPending) return;
    setErr('');
    try {
      await create.mutateAsync({ data: { ...body(incoming), acknowledged: true, eligibilityToken: data.eligibilityToken } });
      keys.current.delete(moveKey);
      setDone(true);
      await client.invalidateQueries();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      setUncertain(!status || status >= 500);
      setErr(status && status < 500 ? (e instanceof Error ? e.message : 'The server rejected this move. Nothing changed.') : 'We could not confirm whether this move was saved. Retrying uses the same request key, so it cannot be charged twice.');
      if (status === 409 || status === 412 || status === 422) void load(incoming, true);
    }
  }

  const eligible = data?.games ?? [];
  const excluded = eligible.find(g => g.eligible === false);
  const pending = data?.pendingVerification || eligible.some(g => g.eligible === null);
  const fee = data?.fee ?? 50;
  const inName = incoming?.name ?? '';
  const seasonRef = (data?.incoming as Record<string, unknown> | undefined)?.seasonPoolPoints ?? (incoming as unknown as { seasonPoolPoints?: number | null } | null)?.seasonPoolPoints ?? incoming?.poolPoints;
  const serverSkew = data ? new Date(data.serverTime).getTime() - Date.now() : 0;
  void now; void serverSkew;

  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#173a4c]/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="drop-title" data-testid="dialog-drop-player" onKeyDown={e => { if (e.key === 'Escape' && !create.isPending) onClose(); }}>
    <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[#d9d2c4] bg-[#faf8f1] p-5 sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div><div className="mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#c65c3e]">Proposed move · nothing changes until confirmed</div><h2 id="drop-title" className="display mt-1 text-3xl font-bold text-[#173a4c]">{done ? 'Transaction saved' : incoming ? 'Confirm transaction' : `Replace ${outgoing.name}`}</h2></div>
        <button ref={closeRef} type="button" onClick={onClose} disabled={create.isPending} aria-label="Close" className="min-h-11 min-w-11 rounded-lg p-2 text-[#173a4c] hover:bg-[#eae6da]" data-testid="button-drop-close"><X size={20} /></button>
      </div>

      {done ? <div className="mt-4" role="status"><p className="text-sm leading-6 text-[#2f6a55]">The server saved this move. {outgoing.name} is now available and {inName} is on the roster at 0 roster points. Rosters, the Undrafted list and the transaction counts have been refreshed.</p><button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-lg bg-[#173a4c] px-4 text-sm font-bold text-[#f5f0e5]" data-testid="button-drop-done">Done</button></div>
      : !incoming ? <div className="mt-4">
        <p className="text-sm text-[#67767c]">Dropping <b>{outgoing.name}</b> ({outgoing.position}{outgoing.team ? `, ${outgoing.team}` : ''}). Only {outgoing.position === 'F' ? 'forwards (centres and wingers)' : 'defencemen'} from the Undrafted Players list can replace this player.</p>
        <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-[#d8d1c3] bg-[#f6f3ea] px-3"><Search size={16} aria-hidden="true" className="text-[#8a9691]" /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} aria-label="Search undrafted players" placeholder="Search name or NHL team" className="w-full bg-transparent text-sm outline-none" data-testid="input-drop-search" /></label>
        {available.isLoading ? <div className="mt-3 space-y-2" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-[#ebe6db]" />)}</div>
          : available.isError ? <p role="alert" className="mt-3 text-sm text-[#874838]">Undrafted Players could not load. <button type="button" className="underline" onClick={() => available.refetch()}>Retry</button></p>
          : rows.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-[#cfc8b9] p-6 text-center text-sm text-[#7a8582]">No matching {outgoing.position === 'F' ? 'forwards' : 'defencemen'} found.</p>
          : <ul className="mt-3 divide-y divide-[#ebe6db] rounded-xl border border-[#e5dfd3]" data-testid="list-drop-candidates">{rows.map(r => <li key={r.nhlPlayerId}><button type="button" onClick={() => choose(r)} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#f1ede3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]" data-testid={`button-pick-${r.nhlPlayerId}`}><span><span className="block text-sm font-semibold text-[#254456]">{r.name}</span><span className="text-xs text-[#788480]">{r.team ?? 'Team unknown'} · {r.position}</span></span><span className="mono text-right text-xs text-[#627177]">{r.poolPoints ?? 'Pending'}<span className="block text-[10px] text-[#9aa19a]">season pool pts</span></span></button></li>)}</ul>}
        <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[#d9d2c4] px-4 text-sm font-semibold text-[#173a4c]" data-testid="button-drop-cancel-search">Cancel</button></div>
      </div>
      : <div className="mt-4">
        {!data && !err && <div className="space-y-2" role="status" aria-busy="true"><div className="h-16 animate-pulse rounded-xl bg-[#ebe6db]" /><div className="h-24 animate-pulse rounded-xl bg-[#ebe6db]" /></div>}
        {!data && err && <p role="alert" className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]">{err} <button type="button" className="underline" onClick={() => void load(incoming)}>Retry</button> · <button type="button" className="underline" onClick={() => { setIncoming(null); setErr(''); }}>Choose another player</button></p>}
        {data && <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-[#f0ece1] p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#788480]">Dropping</dt><dd className="font-semibold text-[#254456]">{str(data.outgoing, 'name') ?? outgoing.name}</dd><dd className="text-xs text-[#627177]">{str(data.outgoing, 'position') ?? outgoing.position} · {str(data.outgoing, 'team') ?? outgoing.team ?? 'Team unknown'}</dd></div>
            <div className="rounded-xl bg-[#e8eee6] p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#788480]">Picking up</dt><dd className="font-semibold text-[#254456]">{str(data.incoming, 'name') ?? inName}</dd><dd className="text-xs text-[#627177]">{str(data.incoming, 'position') ?? incoming.position} · {str(data.incoming, 'team') ?? incoming.team ?? 'Team unknown'}</dd></div>
            <div className="rounded-xl border border-[#e5dfd3] p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#788480]">Season Pool Points (reference only)</dt><dd className="mono font-semibold">{seasonRef == null ? 'Pending' : String(seasonRef)}</dd></div>
            <div className="rounded-xl border border-[#e5dfd3] p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#788480]">Points Earned for Your Roster</dt><dd className="mono font-semibold">0</dd></div>
            <div className="rounded-xl border border-[#e5dfd3] p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#788480]">Transaction fee</dt><dd className="mono font-semibold" data-testid="text-drop-fee">${fee}</dd></div>
            <div className="rounded-xl border border-[#e5dfd3] p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#788480]">Transactions after this move</dt><dd className="mono font-semibold">{data.dropsUsedAfter} used · {data.dropsLeftAfter} remaining of 9</dd></div>
          </dl>

          <section className="mt-4 rounded-xl border border-[#d8d1c3] bg-[#f6f3ea] p-3" aria-live="polite" data-testid="panel-drop-games">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#53666e]">Game eligibility · Toronto time · server clock {fmtSec(data.serverTime)}</h3>
            {pending && <p className="mt-2 text-sm font-semibold text-[#806b39]"><AlertTriangle size={14} className="mr-1 inline" aria-hidden="true" />Pending Verification: the scheduled start could not be verified. We cannot promise that any game will count.</p>}
            {eligible.length === 0 ? <p className="mt-2 text-sm text-[#627177]">No upcoming game was returned for this player.</p>
              : <ul className="mt-2 space-y-2">{eligible.map(g => <li key={g.gameId} className="text-sm text-[#254456]" data-testid={`game-${g.gameId}`}><b>{g.matchup}</b> · {g.gameDate}<br /><span className="text-xs text-[#627177]">Scheduled start {fmtSec(g.scheduledStart)} · Confirm by {fmtSec(g.cutoff)}</span><br /><span className={`text-xs font-bold ${g.eligible === true ? 'text-[#2f6a55]' : g.eligible === false ? 'text-[#9b4330]' : 'text-[#806b39]'}`}>{g.eligible === true ? 'This game will count if confirmed by the deadline.' : g.eligible === false ? 'This game will NOT count.' : 'Pending Verification'}</span></li>)}</ul>}
          </section>

          {excluded && <p className="mt-3 rounded-xl border border-[#e3c98e] bg-[#f8f0d8] p-3 text-sm leading-6 text-[#5e4d17]" role="alert" data-testid="text-drop-late">You can still pick up this player, but their points from {excluded.matchup}, {excluded.gameDate} will not count. The deadline was {fmtSec(excluded.cutoff)}. They will start at 0 points for your roster, and scoring will begin with their next eligible game on a following game day. This move still counts as one transaction and costs ${fee}.</p>}

          <div className="mt-3 rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm leading-6 text-[#6d3a2c]" data-testid="text-drop-warning">
            <p>This transaction is final. You are dropping {outgoing.name} and picking up {inName}. Once confirmed, {outgoing.name} will be removed from your active roster and become available to other participants. You will owe ${fee} for this transaction.</p>
            <p className="mt-2">{inName} starts at 0 points for your roster. Previous points do not transfer. Game eligibility depends on the confirmation deadline shown below.</p>
            <p className="mt-2">If you later pick up {outgoing.name} again, it will count as another transaction and cost another ${fee}. You may only pick that player up if they are still available and you have transactions remaining.</p>
          </div>
          <label className="mt-3 flex min-h-11 items-start gap-3 text-sm font-semibold text-[#254456]"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} disabled={create.isPending} className="mt-1 h-5 w-5 accent-[#14546a]" data-testid="checkbox-drop-ack" /><span>I understand this move is final{excluded ? ', that the excluded game will not count,' : ''} and that I will owe ${fee}.{tokenRef.current && !ack ? ' Eligibility details may have changed; please re-acknowledge.' : ''}</span></label>
        </>}
        {err && data && <p role="alert" className="mt-3 rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]" data-testid="text-drop-error">{err}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => { setIncoming(null); setData(null); setAck(false); setErr(''); }} disabled={create.isPending} className="min-h-11 rounded-lg border border-[#d9d2c4] px-4 text-sm font-semibold text-[#173a4c] disabled:opacity-50" data-testid="button-drop-back">Choose another</button>
          <button type="button" onClick={onClose} disabled={create.isPending} className="min-h-11 rounded-lg border border-[#d9d2c4] px-4 text-sm font-semibold text-[#173a4c] disabled:opacity-50" data-testid="button-drop-cancel">Cancel</button>
          <button type="button" onClick={() => void confirm()} disabled={!data || !ack || create.isPending || preview.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#c65c3e] px-4 text-sm font-bold text-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-drop-confirm">{create.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}{create.isPending ? 'Saving…' : uncertain ? `Retry Confirm — $${fee}` : `Confirm Transaction — $${fee}`}</button>
        </div>
      </div>}
    </div>
  </div>;
}
