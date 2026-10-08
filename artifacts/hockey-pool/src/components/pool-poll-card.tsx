import { useCallback, useState } from 'react';
import type { PoolPoll } from '@workspace/api-client-react';

export type PollAnswers = Record<string, string>;

export function PollCardContent({
  poll,
  answers,
  onSelect,
  interactive,
  showResults = true,
  showHeader = true,
}: {
  poll: PoolPoll;
  answers?: PollAnswers;
  onSelect?: (questionId: string, optionId: string) => void;
  interactive?: boolean;
  showResults?: boolean;
  showHeader?: boolean;
}) {
  return (
    <div>
      {showHeader && (
        <div className="mb-6 flex items-start gap-4">
          <div className="mt-1 hidden h-12 w-1 shrink-0 rounded-full bg-[#e57955] sm:block" aria-hidden="true" />
          <div>
            <h2 className="display text-4xl font-bold leading-none tracking-tight text-[#173a4c] sm:text-5xl">{poll.title || 'What do you think?'}</h2>
            <p className="mt-2 text-sm leading-5 text-[#6c7a7d]">One response per participant.</p>
          </div>
        </div>
      )}
      <div className="space-y-6">
        {poll.questions.map((question) => (
          <fieldset key={question.id} className="min-w-0">
            <legend className="mb-3 font-semibold leading-6 text-[#203443]">{question.prompt}</legend>
            <div className="space-y-2">
              {question.options.map((option) => {
                const active = answers?.[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelect?.(question.id, option.id)}
                    disabled={!interactive}
                    aria-pressed={interactive ? active : undefined}
                    className={`relative flex min-h-12 w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14546a] ${
                      active ? 'border-[#14546a] bg-[#e4efed] text-[#173a4c]' : 'border-[#ded8ca] bg-[#f7f4eb] text-[#53666e] hover:border-[#9db5b3] hover:bg-[#f1eee4]'
                    } ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {showResults && <span className="pointer-events-none absolute inset-y-0 left-0 bg-[#b8d0c9]/45" style={{ width: `${Math.max(0, Math.min(100, option.percentage))}%` }} aria-hidden="true" />}
                    <span className="relative flex min-w-0 items-center gap-2">
                      {interactive && <span className={`h-4 w-4 shrink-0 rounded-full border ${active ? 'border-[#14546a] bg-[#14546a] shadow-[inset_0_0_0_3px_#e4efed]' : 'border-[#9ca9a4]'}`} aria-hidden="true" />}
                      {active && !interactive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#14546a]" aria-hidden="true" />}
                      <span>{option.label}</span>
                    </span>
                    {showResults && <span className="relative shrink-0 text-right"><span className="mono block text-xs font-semibold tabular-nums text-[#173a4c]">{option.percentage}%</span><span className="mono text-[10px] tabular-nums text-[#788681]">{option.votes} votes</span></span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {showResults && <section className="mt-5 border-t border-[#e4dfd2] pt-3" aria-label="Participants who voted">
        <h3 className="mono text-[10px] font-semibold uppercase tracking-[.13em] text-[#82908c]">Participants who voted</h3>
        {poll.participants?.length ? <p className="mt-1 text-xs leading-5 text-[#53666e]">{poll.participants.map((participant) => participant.name).join(' · ')}</p> : <p className="mt-1 text-xs text-[#72807d]">No participants have voted yet.</p>}
      </section>}
    </div>
  );
}

export function usePollAnswerSelection(questions?: PoolPoll['questions']) {
  const [answers, setAnswers] = useState<PollAnswers>({});
  const select = useCallback((questionId: string, optionId: string) => setAnswers((current) => ({ ...current, [questionId]: optionId })), []);
  const clear = useCallback(() => setAnswers({}), []);
  const validAnswers = questions ? Object.fromEntries(Object.entries(answers).filter(([questionId, optionId]) =>
    questions.some(question => question.id === questionId && question.options.some(option => option.id === optionId)))) : answers;
  return {
    answers: validAnswers,
    select,
    clear,
  };
}
