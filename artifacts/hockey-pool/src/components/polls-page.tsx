import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { getGetDailyPoolPollsQueryKey, useGetDailyPoolPolls, useSubmitPoolPoll, type PoolPoll } from '@workspace/api-client-react';
import { PollCardContent, usePollAnswerSelection } from '@/components/pool-poll-card';

const dateText = (date?: string | null) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' }) : 'Date unavailable';
const replacePoll = (old: PoolPoll[] | undefined, poll: PoolPoll) => old?.map((item) => item.id === poll.id ? poll : item) ?? [poll];

export function PollsPage() {
  const { userId, isLoaded } = useAuth();
  const identity = userId ?? 'guest';
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  useEffect(() => { setReadyIdentity(isLoaded ? identity : null); }, [isLoaded, identity]);
  const client = useQueryClient();
  const queryKey = [...getGetDailyPoolPollsQueryKey(), identity];
  const daily = useGetDailyPoolPolls({ query: { queryKey, enabled: isLoaded && readyIdentity === identity, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 0 } });
  useEffect(() => {
    if (!daily.data?.rollsOverAt || !daily.data.serverNow) return;
    const remaining = Date.parse(daily.data.rollsOverAt) - Date.parse(daily.data.serverNow) - (Date.now() - daily.dataUpdatedAt);
    const timer = window.setTimeout(() => { void daily.refetch(); }, Math.max(0, remaining) + 50);
    return () => window.clearTimeout(timer);
  }, [daily.data?.rollsOverAt, daily.data?.serverNow, daily.dataUpdatedAt, daily.refetch]);
  const polls = daily.data?.polls ?? [];
  const today = useMemo(() => polls.find((poll) => poll.publicationDate === daily.data?.today && !poll.legacy), [polls, daily.data?.today]);
  const yesterday = useMemo(() => polls.find((poll) => poll.publicationDate === daily.data?.yesterday && !poll.legacy), [polls, daily.data?.yesterday]);
  const update = (poll: PoolPoll) => client.setQueryData(queryKey, (old: typeof daily.data) => old ? { ...old, polls: replacePoll(old.polls, poll) } : old);

  return <div className="space-y-7">
    {daily.isLoading && <div className="space-y-3" aria-label="Loading polls"><div className="h-16 animate-pulse rounded-2xl bg-[#e7e2d6]"/><div className="h-56 animate-pulse rounded-2xl bg-[#ebe6db]"/></div>}
    {daily.isError && <div className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-4 text-sm text-[#874838]" role="alert">Today’s poll could not load. <button type="button" onClick={() => void daily.refetch()} className="ml-2 font-semibold underline">Retry</button></div>}
    {!daily.isLoading && !daily.isError && <>
      {today ? <PollSection key={`${today.id}-${userId ?? 'guest'}`} poll={today} dateLabel="Today" date={daily.data?.today} serverNow={daily.data?.serverNow} update={update}/> : <div className="rounded-2xl border border-dashed border-[#cfc8b9] bg-[#f6f3ea] p-7 text-center"><h2 className="display text-3xl font-bold text-[#173a4c]">No poll published today yet.</h2><p className="mt-2 text-sm text-[#72807d]">Check back later for today’s question.</p></div>}
      {yesterday && <div className="mt-7"><PollSection key={`${yesterday.id}-${userId ?? 'guest'}`} poll={yesterday} dateLabel="Yesterday" date={daily.data?.yesterday} serverNow={daily.data?.serverNow} update={update}/></div>}
    </>}
    <p className="mt-8 border-l-[3px] border-[#e57955] pl-4 text-sm leading-6 text-[#53666e]">Have an idea for a poll question or topic? Text Edan your suggestion, and we can post it for the group!</p>
  </div>;
}

function PollSection({ poll, dateLabel: label, date, serverNow, update }: { poll: PoolPoll; dateLabel: string; date?: string; serverNow?: string; update: (poll: PoolPoll) => void }) {
  const { userId } = useAuth();
  const client = useQueryClient();
  const submit = useSubmitPoolPoll();
  const { answers, select } = usePollAnswerSelection(poll.questions);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const serverOffset = useMemo(() => serverNow ? Date.parse(serverNow) - Date.now() : 0, [serverNow]);
  const timeOpen = !poll.closesAt || clock + serverOffset < Date.parse(poll.closesAt);
  const open = Boolean(poll.isOpen && timeOpen && label === 'Today');
  const alreadyVoted = Boolean(poll.hasVoted && poll.myAnswers);
  const canAnswer = Boolean(userId && poll.canVote && open && !alreadyVoted);
  const answerCount = Object.keys(answers).length;
  const answerTotal = poll.questions.length;
  const send = async () => {
    if (!userId || !canAnswer || alreadyVoted || answerCount !== answerTotal) return;
    setError('');
    try {
      const saved = await submit.mutateAsync({ data: { pollId: poll.id, answers } });
      update(saved);
      await client.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').includes('/poll/') });
    } catch {
      setError('Your response did not save. Your selections are still here—try again.');
    }
  };
  const eligible = poll.eligibleParticipantCount ?? 9;
  return <section className="overflow-hidden rounded-2xl border border-[#ded8ca] bg-[#faf8f1] shadow-[0_3px_16px_rgba(46,52,49,.035)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2ddcf] px-5 py-4 sm:px-7"><div><span className="mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#bf583d]">{label} · {dateText(date || poll.publicationDate)}</span><h2 className="display mt-1 text-3xl font-bold text-[#173a4c]">{poll.title || 'What do you think?'}</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${open ? 'bg-[#e4efed] text-[#14546a]' : 'bg-[#efe9dc] text-[#65747e]'}`}>{open ? 'Voting open' : 'Voting closed'}</span></div>
    <div className="px-5 py-6 sm:px-7"><PollCardContent poll={poll} answers={alreadyVoted ? poll.myAnswers ?? {} : answers} onSelect={select} interactive={canAnswer} showResults showHeader={false}/>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e4dfd2] pt-3 text-xs text-[#72807d]"><span>{poll.respondentCount} of {eligible} participants voted</span><span>{alreadyVoted ? <b className="text-[#14546a]">You voted</b> : 'Not voted yet'}</span></div>
      {alreadyVoted && <div className="mt-3 text-sm leading-6 text-[#53666e]">{poll.questions.map((question) => <p key={question.id}><span className="font-semibold">{question.prompt}</span> {question.options.find((option) => option.id === poll.myAnswers?.[question.id])?.label ?? '—'}</p>)}</div>}
      {open && !alreadyVoted && <div className="mt-5">{error && <p className="mb-3 rounded-lg border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]" role="alert">{error}</p>}<button type="button" onClick={() => void send()} disabled={!canAnswer || answerCount !== answerTotal || submit.isPending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173a4c] px-5 text-sm font-bold text-[#f5f0e5] transition hover:bg-[#22566a] disabled:cursor-not-allowed disabled:opacity-45">{submit.isPending ? <><LoaderCircle size={16} className="animate-spin"/>Saving your response</> : <>Submit response <ArrowRight size={16}/></>}</button>{!userId && <p className="mt-2 text-center text-xs text-[#72807d]">Sign in as a linked participant to vote.</p>}</div>}
      {!open && <p className="mt-5 text-sm font-semibold text-[#72807d]">Voting closed</p>}
    </div>
  </section>;
}
