import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LoaderCircle, X } from 'lucide-react';
import { getGetDailyPoolPollsQueryKey, useClaimPoolPollPopup, useGetDailyPoolPolls, useSubmitPoolPoll, type PoolPoll } from '@workspace/api-client-react';
import { PollCardContent, usePollAnswerSelection } from '@/components/pool-poll-card';

const isAuthRoute = (path: string) => /^\/(sign-in|sign-up)(\/|$)/.test(path);
const excluded = (path: string) => isAuthRoute(path) || path === '/polls';

export function PoolPollPopup() {
  const { userId, isLoaded } = useAuth();
  const [path] = useLocation();
  const client = useQueryClient();
  const identity = userId ?? 'guest';
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  const [claimedPoll, setClaimedPoll] = useState<{ identity: string; poll: PoolPoll } | null>(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activePollId = useRef<string | null>(null);
  const claim = useClaimPoolPollPopup();
  const submit = useSubmitPoolPoll();
  const selection = usePollAnswerSelection(claimedPoll?.identity === identity ? claimedPoll.poll.questions : undefined);
  const inFlight = useRef(false);
  const authReady = isLoaded && readyIdentity === identity;
  const canCheck = authReady && !!userId && !excluded(path);
  const daily = useGetDailyPoolPolls({ query: { queryKey: [...getGetDailyPoolPollsQueryKey(), identity], enabled: canCheck, refetchInterval: canCheck ? 15_000 : false, refetchOnWindowFocus: true, staleTime: 0 } });
  const poll = claimedPoll?.identity === identity ? claimedPoll.poll : null;
  const serverOffset = daily.data?.serverNow ? Date.parse(daily.data.serverNow) - daily.dataUpdatedAt : 0;
  const isExpired = Boolean(poll?.closesAt && clock + serverOffset >= Date.parse(poll.closesAt));
  const canVote = Boolean(poll?.canVote && poll.isOpen && !poll.hasVoted && !isExpired);
  const open = Boolean(canCheck && poll && !isExpired && (canVote || poll.hasVoted));

  useEffect(() => { setReadyIdentity(isLoaded ? identity : null); }, [isLoaded, identity]);
  useEffect(() => { setClaimedPoll(null); setError(''); selection.clear(); activePollId.current = null; }, [identity]);
  useEffect(() => { const id = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    if (!poll || !daily.data) return;
    const refreshed = daily.data.polls.find((entry) => entry.id === poll.id);
    if (isExpired || (refreshed && !refreshed.isOpen)) {
      activePollId.current = null;
      setClaimedPoll((current) => current?.poll.id === poll.id ? null : current);
      return;
    }
    if (!refreshed) {
      activePollId.current = null;
      setClaimedPoll((current) => current?.identity === identity && current.poll.id === poll.id ? null : current);
      return;
    }
    const next = poll.hasVoted && poll.myAnswers && !refreshed.hasVoted
      ? { ...refreshed, hasVoted: true, myAnswers: poll.myAnswers, canVote: false }
      : refreshed;
    setClaimedPoll((current) => current?.poll.id === poll.id ? { identity, poll: next } : current);
  }, [daily.data, identity, poll?.id, poll?.hasVoted, poll?.myAnswers, isExpired]);
  useEffect(() => {
    if (!canCheck || !daily.data?.rollsOverAt || !daily.data.serverNow) return;
    const remaining = Date.parse(daily.data.rollsOverAt) - Date.parse(daily.data.serverNow) - (Date.now() - daily.dataUpdatedAt);
    const timer = window.setTimeout(() => { void daily.refetch(); }, Math.max(0, remaining) + 50);
    return () => window.clearTimeout(timer);
  }, [canCheck, daily.data?.rollsOverAt, daily.data?.serverNow, daily.dataUpdatedAt, daily.refetch]);

  const checkClaim = useCallback(async () => {
    if (!canCheck || inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await claim.mutateAsync();
      if (identityRef.current !== identity) return;
      const nextPoll = result.poll;
      if (nextPoll && nextPoll.isOpen && nextPoll.canVote && !nextPoll.hasVoted && !nextPoll.legacy) {
        const key = [...getGetDailyPoolPollsQueryKey(), identity];
        await client.cancelQueries({ queryKey: key, exact: true });
        if (identityRef.current !== identity) return;
        if (activePollId.current !== nextPoll.id) {
          activePollId.current = nextPoll.id;
          selection.clear();
          setError('');
        }
        client.setQueryData(key, (old: { polls: PoolPoll[] } | undefined) => old
          ? { ...old, polls: old.polls.some((entry) => entry.id === nextPoll.id) ? old.polls.map((entry) => entry.id === nextPoll.id ? nextPoll : entry) : [nextPoll, ...old.polls] }
          : old);
        setClaimedPoll({ identity, poll: nextPoll });
      }
    } catch {
      if (identityRef.current === identity) setError('The poll could not be checked. You can keep browsing; we’ll try again shortly.');
    } finally {
      inFlight.current = false;
    }
  }, [canCheck, identity, claim.mutateAsync, client, selection.clear]);

  useEffect(() => { void checkClaim(); }, [checkClaim, path]);
  useEffect(() => {
    if (!canCheck) return;
    const timer = window.setInterval(() => void checkClaim(), 15_000);
    const onFocus = () => { if (document.visibilityState === 'visible') void checkClaim(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [canCheck, checkClaim]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setClaimedPoll(null); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [open]);

  if (!poll || !open) return null;
  const send = async () => {
    if (!canVote || Object.keys(selection.answers).length !== poll.questions.length) return;
    setError('');
    try {
      const saved = await submit.mutateAsync({ data: { pollId: poll.id, answers: selection.answers } });
      if (identityRef.current !== identity) return;
      setClaimedPoll({ identity, poll: saved });
      const dailyKey = [...getGetDailyPoolPollsQueryKey(), identity];
      client.setQueryData(dailyKey, (old: { polls: PoolPoll[] } | undefined) => old ? { ...old, polls: old.polls.map((entry) => entry.id === saved.id ? saved : entry) } : old);
      await client.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').includes('/poll/') });
    } catch {
      if (identityRef.current === identity) setError('Your response did not save. Your selections are still here—try again.');
    }
  };
  const voted = poll.hasVoted && !!poll.myAnswers;
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#102c38]/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-5" data-testid="pool-poll-backdrop">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pool-poll-title" className="max-h-[min(90dvh,820px)] w-full overflow-y-auto overscroll-contain rounded-t-[24px] border border-[#d9d2c4] bg-[#faf8f1] text-[#203443] shadow-[0_24px_90px_rgba(15,36,44,.3)] sm:max-w-[580px] sm:rounded-[24px]" data-testid="pool-poll-popup">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e2ddcf] bg-[#faf8f1]/95 px-5 py-4 backdrop-blur-md sm:px-7"><span className="mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#bf583d]">Pool room · your read</span><button ref={closeRef} type="button" onClick={() => setClaimedPoll(null)} aria-label="Close poll and enter" className="grid h-10 w-10 place-items-center rounded-full text-[#63727a] transition hover:bg-[#eee9dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#14546a]" data-testid="button-close-poll"><X size={19}/></button></div>
      <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7"><PollCardContent poll={poll} answers={voted ? poll.myAnswers ?? {} : selection.answers} onSelect={selection.select} interactive={canVote && !voted} showResults/>
        <div className="mt-4 flex items-center justify-between border-t border-[#e4dfd2] pt-3 text-xs text-[#72807d]"><span>{poll.respondentCount} of {poll.eligibleParticipantCount ?? 9} participants voted</span><span className="mono uppercase tracking-[.1em]">Live pool read</span></div>
        {error && <p className="mt-4 rounded-lg border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]" role="alert">{error}</p>}
        {canVote && !voted && <button type="button" onClick={() => void send()} disabled={Object.keys(selection.answers).length !== poll.questions.length || submit.isPending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173a4c] px-5 text-sm font-bold text-[#f5f0e5] disabled:opacity-45">{submit.isPending ? <><LoaderCircle size={16} className="animate-spin"/>Saving your response</> : <>Submit response <ArrowRight size={16}/></>}</button>}
        {voted && <p className="mt-5 text-sm font-semibold text-[#14546a]">You voted. Your response is saved.</p>}
      </div>
    </div>
  </div>;
}
