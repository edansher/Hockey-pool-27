import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "wouter";
import { useParticipantSwap, type SwapStorage } from "@workspace/api-client-react";

const storage: SwapStorage = {
  getItem: async key => localStorage.getItem(key),
  setItem: async (key, value) => localStorage.setItem(key, value),
  removeItem: async key => localStorage.removeItem(key),
};
const hooks = { useEffect, useRef, useState };

export function ParticipantSwap() {
  const { isLoaded, userId } = useAuth();
  const swap = useParticipantSwap(hooks, isLoaded ? userId ?? null : undefined, storage, () => crypto.randomUUID());
  const [ownerId, setOwnerId] = useState("");
  const [outgoing, setOutgoing] = useState("");
  const [incoming, setIncoming] = useState("");
  const [confirming, setConfirming] = useState(false);
  const owners = swap.access.data?.owners ?? [];
  const owner = owners.find(p => p.ownerId === ownerId) ?? owners[0];
  const outgoingPlayer = owner?.skaters.find(p => p.playerId === outgoing);
  const incomingPlayer = swap.pickups.find(p => String(p.nhlPlayerId) === incoming);
  const locked = swap.busy || !!swap.attempt;
  const canSubmit = !!owner && !!outgoingPlayer && !!incomingPlayer && swap.ready;
  const selectClass = "mt-1 w-full rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3 py-3 text-sm";
  return <section className="rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-5" data-testid="participant-swap">
    <h2 className="display text-2xl font-bold text-[#173a4c]">Make a skater swap</h2>
    <p className="mt-2 text-sm text-[#5f6f73]">Each saved drop costs $50 and uses one of your nine drops. Earned drop points stay frozen; pickup points count only after pickup. No commissioner approval.</p>
    {!isLoaded || swap.access.isLoading ? <p className="mt-3">Checking account access…</p> :
      swap.access.error ? <button onClick={() => swap.access.refetch()} className="mt-3 underline">Account access could not load. Retry</button> :
      !swap.access.data?.authenticated ? <Link href="/sign-in" className="mt-4 inline-block font-bold underline" data-testid="swap-sign-in">Sign in to make a swap</Link> :
      !owners.length ? <p role="status" className="mt-3">{swap.access.data.reason}</p> :
      <form className="mt-4 space-y-4" onSubmit={e => {
        e.preventDefault();
        if (swap.attempt) { void swap.submit(swap.attempt.body); return; }
        if (!canSubmit || swap.busy) return;
        if (!confirming) { void swap.review({ ownerId: owner!.ownerId, outgoingPlayerId: outgoing, incomingPlayerId: incoming }).then(ok => setConfirming(ok)); return; }
        void swap.submit({ ownerId: owner!.ownerId, outgoingPlayerId: outgoing, incomingPlayerId: incoming }).then(() => {
          setConfirming(false); setOutgoing(""); setIncoming("");
        });
      }}>
        {swap.access.data?.admin && owners.length > 1 ? <label className="block text-sm font-bold">Administrator: participant
          <select data-testid="swap-owner" disabled={locked} className={selectClass} value={owner?.ownerId ?? ""} onChange={e => { setOwnerId(e.target.value); setOutgoing(""); setConfirming(false); }}>
            {owners.map(p => <option key={p.ownerId} value={p.ownerId}>{p.ownerName}</option>)}
          </select></label> : <p data-testid="swap-linked-owner" className="font-bold">Your roster: {owner?.ownerName}</p>}
        <label className="block text-sm font-bold">Skater to drop
          <select data-testid="swap-outgoing" disabled={locked} className={selectClass} value={outgoing} onChange={e => { setOutgoing(e.target.value); setConfirming(false); }}>
            <option value="">Choose an active skater</option>{owner?.skaters.map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
          </select></label>
        <label className="block text-sm font-bold">Available skater to pick up
          <select data-testid="swap-incoming" disabled={locked} className={selectClass} value={incoming} onChange={e => { setIncoming(e.target.value); setConfirming(false); }}>
            <option value="">Choose an available skater</option>{swap.pickups.map(p => <option key={p.nhlPlayerId} value={String(p.nhlPlayerId)}>{p.name} · {p.team} · {p.poolPoints} pts</option>)}
          </select></label>
        {swap.available.isLoading && <p>Loading available skaters…</p>}
        {swap.available.error && <button type="button" onClick={() => swap.available.refetch()} className="underline">Available skaters could not load. Retry</button>}
        {!swap.available.isLoading && !swap.available.error && !swap.pickups.length && <p>No available skaters currently have verified scoring. Try refreshing later.</p>}
        {confirming && !swap.attempt && <p role="status" data-testid="swap-confirmation">Confirm {owner?.ownerName}: drop <strong>{outgoingPlayer?.name}</strong>, pick up <strong>{incomingPlayer?.name}</strong>. This saves immediately and adds $50 owing.</p>}
        {confirming && swap.preview && <div data-testid="swap-eligibility" className="space-y-2 rounded-xl border border-[#ded8ca] p-3 text-sm">
          <p>{swap.preview.dropsLeftAfter} drops will remain. Confirming acknowledges the game eligibility below.</p>
          {swap.preview.pendingVerification && <p>Some game times are unverified. Pickup scoring stays pending until official times are verified.</p>}
          {!swap.preview.games.length && <p>No scheduled games in the current eligibility window.</p>}
          {swap.preview.games.map(game => <p key={game.gameId}>{game.gameDate} · {game.matchup}: <strong>{game.eligible === true ? "Eligible" : game.eligible === false ? "Excluded — deadline passed" : "Pending verification"}</strong>{game.cutoff && ` · Cutoff ${new Date(game.cutoff).toLocaleString("en-CA", { timeZone: "America/Toronto" })} Toronto`}</p>)}
        </div>}
        {swap.attempt && <p>Pending confirmation: drop NHL #{swap.attempt.body.outgoingPlayerId}, pick up NHL #{swap.attempt.body.incomingPlayerId}. Retry preserves the original time and fee.</p>}
        <button data-testid="swap-submit" disabled={swap.busy || !swap.ready || (!swap.attempt && !canSubmit)} className="min-h-11 rounded-xl bg-[#173a4c] px-5 py-3 font-bold text-white disabled:opacity-40">
          {swap.busy ? "Please wait…" : swap.attempt ? "Retry saved submission" : confirming ? "Confirm and acknowledge · $50" : "Review swap"}
        </button>
        {confirming && !locked && <button type="button" onClick={() => setConfirming(false)} className="ml-4 underline">Cancel</button>}
      </form>}
    {swap.message && <p role="status" data-testid="swap-result" className="mt-4 rounded-xl border border-[#ded8ca] p-3 text-sm">{swap.message}</p>}
  </section>;
}