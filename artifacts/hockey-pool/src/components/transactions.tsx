import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Volume2, VolumeX, ArrowRight, ArrowDownRight, ArrowUpRight, ArrowLeftRight, AlertTriangle, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { formatTransactionTime, transactionPlayerPosition, transactionPlayerTeam, useGetDraftRosters, TRANSACTION_TICKER_INTERVAL_MS } from '@workspace/api-client-react';
import type { Transaction } from '@workspace/api-client-react';
import { useTransactionAlert, useTransactionSummaryPolling } from '@/hooks/use-transaction-alert';
import { TransactionPaymentBadge } from './transaction-payment-badge';
import { ParticipantSwap } from './participant-swap';

const money = (n: number) => `$${n.toFixed(2)}`;

function TransactionTicker({ transactions }: { transactions: Transaction[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const ids = transactions.map(t => t.id).join('|');
  const count = transactions.length;
  useEffect(() => { setIndex(0); }, [ids]);
  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex(i => (i + 1) % count), TRANSACTION_TICKER_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [ids, count, paused]);
  const current = transactions[index % count];
  if (!current) return null;
  const control = 'inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#efd7ce] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#874838]';
  return <div className="mb-2 rounded-xl border border-[#e3b8aa] bg-[#fbede7] px-4 py-2.5 text-sm text-[#874838]" data-testid="alert-new-transaction">
    <div className="mb-1 flex items-center justify-between gap-2">
      <strong>{count > 1 ? 'New transactions' : 'New transaction.'}</strong>
      {count > 1 && <div className="flex shrink-0 items-center gap-1">
        <span className="mono mr-1 text-[10px]" data-testid="transaction-ticker-count">{index % count + 1} / {count}</span>
        <button type="button" className={control} aria-label="Previous transaction" onClick={() => setIndex(i => (i + count - 1) % count)}><ChevronLeft size={15}/></button>
        <button type="button" className={control} aria-label={paused ? 'Resume transaction ticker' : 'Pause transaction ticker'} onClick={() => setPaused(p => !p)}>{paused ? <Play size={13}/> : <Pause size={13}/>}</button>
        <button type="button" className={control} aria-label="Next transaction" onClick={() => setIndex(i => (i + 1) % count)}><ChevronRight size={15}/></button>
      </div>}
    </div>
    <div role="status" aria-live="polite" aria-atomic="true" key={current.id} data-testid="transaction-ticker-message">{current.ownerName} dropped {current.outgoingPlayerName || 'a player'} and picked up {current.incomingPlayerName || 'a player'}.</div>
  </div>;
}

export function TransactionsEntry({ className = '', tickerBelow = false }: { className?: string; tickerBelow?: boolean }) {
  const { recentTransactions, unread, alerting, buttonFlashing, markSeen, soundBlocked, soundPlaying, playSound, stopSound } = useTransactionAlert();
  return <div className={className}>
    <style>{`@keyframes tx-flash{0%,100%{opacity:0}50%{opacity:.3}}.tx-flash{animation:tx-flash 2s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.tx-flash{animation-duration:6s;opacity:.15}}`}</style>
    {alerting && !tickerBelow && <TransactionTicker transactions={recentTransactions}/>}
    <Link href="/transactions" onClick={() => markSeen()} data-testid="button-transactions" aria-label={unread ? 'Transactions, new unread transaction' : 'Transactions'} className={`relative inline-flex min-h-11 w-full items-center justify-between overflow-hidden rounded-xl px-4 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173a4c] bg-[#b3261e] text-white`}>
      {buttonFlashing && <span data-testid="transaction-button-flash" aria-hidden="true" className={`tx-flash pointer-events-none absolute inset-0 bg-[#ffd9d4]`}/>}
      <span className="relative flex items-center gap-2"><ArrowLeftRight size={18} aria-hidden="true"/>Transactions{unread && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b3261e]" data-testid="badge-unread-transaction">New</span>}</span>
      <ArrowRight size={16} className="relative" aria-hidden="true"/>
    </Link>
    {alerting && tickerBelow && <div className="mt-2"><TransactionTicker transactions={recentTransactions}/></div>}
    {buttonFlashing && soundBlocked && !soundPlaying && <button type="button" onClick={() => playSound()} data-testid="button-play-alert-sound" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#8f2019] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]"><Volume2 size={16} aria-hidden="true"/><span>Play 25-second alert<span className="block font-normal text-[#5f6f73]">Your browser requires a tap to play sound.</span></span></button>}
    {soundPlaying && <button type="button" onClick={() => stopSound()} data-testid="button-stop-alert-sound" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#8f2019] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]"><VolumeX size={16} aria-hidden="true"/>Stop sound</button>}
  </div>;
}

const card = 'rounded-2xl border border-[#ded8ca] bg-[#faf8f1]';
function Msg({ tone = 'info', children, testid }: { tone?: 'info' | 'warn' | 'err'; children: React.ReactNode; testid?: string }) {
  const c = tone === 'err' ? 'border-[#e3b8aa] bg-[#fbede7] text-[#874838]' : tone === 'warn' ? 'border-[#e6d3a3] bg-[#f8f0d9] text-[#6d5a1f]' : 'border-[#ded8ca] bg-[#f6f3ea] text-[#5f6f73]';
  return <div role={tone === 'err' ? 'alert' : 'status'} data-testid={testid} className={`rounded-xl border p-4 text-sm leading-6 ${c}`}>{children}</div>;
}

export function TransactionsView() {
  const { query, latest, markSeen, persistFailed } = useTransactionAlert(false);
  const summary = useTransactionSummaryPolling();
  const rosters = useGetDraftRosters();
  const [owner, setOwner] = useState('');
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const f = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  useEffect(() => { if (latest && visible) markSeen(latest.id); }, [latest?.id, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = query.data;
  const rows = useMemo(() => [...(all ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).filter((t) => !owner || t.ownerId === owner), [all, owner]);
  const owners = useMemo(() => Array.from(new Map((all ?? []).map((t) => [t.ownerId, t.ownerName])).entries()), [all]);
  const s = summary.data;
  return <div className="space-y-5">
    <Msg testid="transaction-skaters-only"><strong>Skater transactions only.</strong> Goalies cannot be dropped or traded.</Msg>
    <ParticipantSwap />
    {persistFailed && <Msg tone="warn" testid="status-persist-failed">This browser blocked saved storage, so unread tracking works only until you close this tab.</Msg>}
    {summary.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-[#ece8dc]" data-testid="loading-summary"/> : summary.error ? <Msg tone="err" testid="error-summary">Transaction totals could not load. <button onClick={() => summary.refetch()} className="font-bold underline">Retry</button></Msg> : s && <>
      <div className="rounded-[26px] bg-[#173a4c] px-6 py-7 text-[#f5f0e5]" data-testid="panel-total-pool-earnings">
        <div className="mono text-[10px] uppercase tracking-[.2em] text-[#df9879]">Total pool earnings</div>
        <div className="display mt-1 text-6xl font-bold tabular-nums md:text-7xl" data-testid="text-total-pool-earnings">{money(s.totalPoolEarnings)}</div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          {[['Base earnings', money(s.baseEarnings)], ['Completed transactions', String(s.totalCompletedTransactions)], ['Cost per transaction', money(s.transactionCost)], ['Max drops each', String(s.maxDrops)]].map(([k, v]) => <div key={k}><dt className="text-[11px] uppercase tracking-wide text-[#a9b6c0]">{k}</dt><dd className="mono mt-1 text-lg font-semibold tabular-nums">{v}</dd></div>)}
        </dl>
      </div>
      <section className={`${card} p-5`} aria-labelledby="season-end-payouts" data-testid="panel-season-end-payouts">
        <h2 id="season-end-payouts" className="display text-2xl font-bold text-[#173a4c]">Season-end payout earnings</h2>
        <p className="mt-1 text-sm text-[#5f6f73]">Estimates based on the current total pot. Final payouts use the total pot at the end of the season.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {s.payouts?.map((payout) => <div key={payout.place} className="rounded-xl border border-[#e1dccf] bg-[#f4f1e8] p-4" data-testid={`payout-place-${payout.place}`}>
            <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-[#254456]">{payout.place === 1 ? '1st' : payout.place === 2 ? '2nd' : '3rd'} place</h3><span className="mono text-sm font-semibold text-[#874838]">{payout.percentage}% of pot</span></div>
            <div className="mono mt-2 text-2xl font-bold tabular-nums text-[#173a4c]">{money(payout.amount)}</div>
            <p className="mt-2 text-xs text-[#5f6f73]">Two-way tie: <strong>{money(payout.twoWayTieAmount)} each</strong></p>
          </div>)}
        </div>
        <div className="mt-4 rounded-xl border border-[#e1dccf] bg-[#f4f1e8] p-4 text-sm leading-6 text-[#254456]">
          <h3 className="font-bold text-[#173a4c]">Tie payout rules</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Two teams tied for 1st place: They combine and split the 1st- and 2nd-place prizes equally (65% + 25%), receiving 45% each. The next team finishes 3rd and receives 10%.</li>
            <li>Two teams tied for 2nd place: They combine and split the 2nd- and 3rd-place prizes equally (25% + 10%), receiving 17.5% each.</li>
          </ul>
        </div>
      </section>
      {!s.recordingEnabled
        ? <Msg tone="warn" testid="status-recording-unavailable"><div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true"/><div>{s.recordingReason || 'Sign in with your securely linked participant account to record your own skater swaps.'}</div></div></Msg>
        : <Msg testid="status-recording-enabled">Recording is switched on. Completed drops and pickups appear below as soon as the server records them.</Msg>}
      <div className={`${card} overflow-x-auto`}><table className="w-full min-w-[560px] text-left" data-testid="table-participants"><caption className="sr-only">Participant transaction counters</caption>
        <thead><tr className="border-b border-[#e1dccf] text-[10px] uppercase tracking-[.12em] text-[#87918e]"><th className="px-4 py-3 font-semibold">Participant</th><th className="px-3 py-3 text-right font-semibold">Drops used</th><th className="px-3 py-3 text-right font-semibold">TOTAL DROPS LEFT</th><th className="px-3 py-3 text-right font-semibold">TOTAL TRANSACTION SPEND</th><th className="px-4 py-3 text-right font-semibold">Amount owing</th></tr></thead>
        <tbody>{s.participants.map((p) => <tr key={p.ownerId} className="border-b border-[#ebe6db] last:border-0" data-testid={`row-participant-${p.ownerId}`}><td className="px-4 py-3 text-sm font-semibold text-[#254456]">{p.ownerName}</td><td className="mono px-3 py-3 text-right tabular-nums">{p.dropsUsed}</td><td className="mono px-3 py-3 text-right tabular-nums">{p.dropsLeft}</td><td className="mono px-3 py-3 text-right tabular-nums">{money(p.transactionSpend)}</td><td className="mono px-4 py-3 text-right font-semibold tabular-nums">{p.amountOwing==null?'—':money(p.amountOwing)}</td></tr>)}</tbody></table></div>
    </>}
    <section className={`${card} overflow-hidden`} aria-labelledby="tx-history">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1dccf] px-5 py-4"><div><div className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">Read-only history, newest first</div><h2 id="tx-history" className="display text-2xl font-bold text-[#173a4c]">Completed transactions</h2></div>
        {owners.length > 1 && <select aria-label="Filter by participant" value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3 py-2.5 text-sm" data-testid="select-transaction-owner"><option value="">All participants</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}</div>
      <div className="p-4">
        {query.isLoading ? <div className="space-y-3" data-testid="loading-transactions">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[#ece8dc]"/>)}</div>
        : query.error && !all ? <Msg tone="err" testid="error-transactions">Transaction history could not load. <button onClick={() => query.refetch()} className="font-bold underline" data-testid="button-retry-transactions">Retry</button></Msg>
        : !rows.length ? <Msg testid="empty-transactions">No drops or pickups have been recorded yet. Completed transactions will appear here the moment they are saved.</Msg>
        : <table className="w-full border-separate [border-spacing:0_0.75rem] text-left" aria-label="Completed transactions and payment status"><thead><tr className="text-xs text-[#67767c]"><th className="px-4">Completed drop / pickup</th><th className="px-3">Paid / not paid</th></tr></thead><tbody>{rows.map((t: Transaction) => <tr key={t.id} data-testid={`row-transaction-${t.id}`}>
          <td className="rounded-l-xl border-y border-l border-[#e5dfd1] bg-[#f6f3ea] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-base font-bold text-[#173a4c]" data-testid={`text-owner-${t.id}`}>{t.ownerName}</span>{t.reversedAt ? <span className="rounded-full bg-[#f7e5dc] px-2 py-1 text-[10px] font-bold uppercase text-[#a34e39]">Reversed {formatTransactionTime(t.reversedAt)}</span> : <span className="text-[11px] font-semibold uppercase tracking-wide text-[#42715e]">Completed</span>}</div>
            <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">{(['outgoing', 'incoming'] as const).map(side => {
              const position = transactionPlayerPosition(t, side, rosters.data);
              const team = transactionPlayerTeam(t, side, rosters.data);
              return <div key={side} className={`flex items-start gap-2 ${side === 'outgoing' ? 'text-[#8a4a38]' : 'text-[#2f6a55]'}`}>
                {side === 'outgoing' ? <ArrowDownRight size={15} className="mt-0.5 shrink-0" aria-hidden="true"/> : <ArrowUpRight size={15} className="mt-0.5 shrink-0" aria-hidden="true"/>}
                <div>{side === 'outgoing' ? 'Dropped' : 'Picked up'} <strong>{(side === 'outgoing' ? t.outgoingPlayerName : t.incomingPlayerName) || 'no player'}</strong>
                  {position && <span data-testid={`position-${side}-${t.id}`} className={`ml-2 inline-block rounded px-2 py-0.5 text-xs font-semibold ${position === 'Defense' ? 'bg-blue-100 text-blue-900' : 'bg-yellow-100 text-yellow-900'}`}>{position}</span>}
                  <span data-testid={`text-${side}-team-${t.id}`} className="mt-1 block text-xs text-[#67767c]">{team ?? 'NHL team pending'}</span>
                </div>
              </div>;
            })}</div>
            <div className="mono mt-3 text-[11px] text-[#5f6f73]" data-testid={`text-time-${t.id}`}>Drop made <time dateTime={t.effectiveAt}>{formatTransactionTime(t.effectiveAt)}</time></div>
          </td><td className="w-28 rounded-r-xl border-y border-r border-[#e5dfd1] bg-[#f6f3ea] p-3 align-top" data-testid={`payment-status-${t.id}`}><TransactionPaymentBadge paid={t.paid}/></td>
          </tr>)}</tbody></table>}
      </div>
    </section>
  </div>;
}
