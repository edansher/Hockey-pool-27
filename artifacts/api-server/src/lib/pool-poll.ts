export const POOL_POLL = {
  id: "cohen-martone-october-2026",
  title: "What do you think?",
  questions: [
    {
      id: "timing",
      prompt: "What do you think of Cohen's move?",
      options: [
        { id: "too-early", label: "Too early in the season." },
        { id: "good-move", label: "Martone is underperforming — it's a good move." },
      ],
    },
    {
      id: "outlook",
      prompt: "How do you think this move will affect Cohen's pool finish?",
      options: [
        { id: "improve", label: "Improve his finish." },
        { id: "no-change", label: "Make little or no difference." },
        { id: "hurt", label: "Hurt his finish." },
      ],
    },
  ],
} as const;

export type PollAnswers = Record<string, string>;
export type PollQuestions = ReadonlyArray<{
  id: string; prompt: string; options: ReadonlyArray<{ id: string; label: string }>;
}>;

export function parsePollAnswers(value: unknown, questions: PollQuestions = POOL_POLL.questions): PollAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== questions.length) return null;
  if (!questions.every(question =>
    question.options.some(option => option.id === record[question.id]))) return null;
  return record as PollAnswers;
}

/** Largest-remainder rounding keeps each answered question's percentages at 100%. */
export function pollResults(answers: PollAnswers[], questions: PollQuestions = POOL_POLL.questions) {
  return questions.map(question => {
    const counts = question.options.map(option =>
      answers.filter(answer => answer[question.id] === option.id).length);
    const exact = counts.map(count => answers.length ? count * 1000 / answers.length : 0);
    const tenths = exact.map(value => Math.floor(value));
    const remainder = answers.length ? 1000 - tenths.reduce((sum, value) => sum + value, 0) : 0;
    const order = exact.map((value, index) => ({ index, fraction: value - tenths[index] }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < remainder; i++) tenths[order[i].index]++;
    return {
      id: question.id,
      prompt: question.prompt,
      options: question.options.map((option, index) => ({
        ...option, votes: counts[index], percentage: tenths[index] / 10,
      })),
    };
  });
}

const torontoCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
});
const torontoWallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** Polls use calendar midnight, deliberately NOT the scoring system's 2 a.m. day. */
export function pollCalendarDate(now = new Date()) {
  const parts = new Map(torontoCalendar.formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

export function shiftPollDate(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function pollClosesAt(date: string) {
  const next = shiftPollDate(date, 1);
  const target = Date.parse(`${next}T00:00:00Z`);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Map(torontoWallClock.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const wall = Date.parse(`${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}Z`);
    instant += target - wall;
  }
  return new Date(instant).toISOString();
}

export function parsePollDraft(value: unknown): { id?: string; title: string; questions: PollQuestions } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const text = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.trim().length <= max;
  const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
  if ((draft.id !== undefined && !id(draft.id)) || !text(draft.title, 120) ||
    !Array.isArray(draft.questions) || !draft.questions.length || draft.questions.length > 5) return null;
  const questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }> = [];
  for (const q of draft.questions) {
    if (!q || !id(q.id) || !text(q.prompt, 500) || !Array.isArray(q.options) ||
      q.options.length < 2 || q.options.length > 6 || questions.some(x => x.id === q.id)) return null;
    const options: Array<{ id: string; label: string }> = [];
    for (const option of q.options) {
      if (!option || !id(option.id) || !text(option.label, 250) ||
        options.some(x => x.id === option.id || x.label.toLowerCase() === option.label.trim().toLowerCase())) return null;
      options.push({ id: option.id, label: option.label.trim() });
    }
    questions.push({ id: q.id, prompt: q.prompt.trim(), options });
  }
  return { ...(draft.id ? { id: draft.id as string } : {}), title: draft.title.trim(), questions };
}
