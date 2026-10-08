import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { participantAccounts } from "./participant-accounts";
import {
  POOL_POLL, parsePollAnswers, parsePollDraft, pollResults, pollCalendarDate, pollClosesAt, shiftPollDate,
  type PollAnswers, type PollQuestions,
} from "./pool-poll";

type Query = Pick<typeof pool, "query">;
type PollRecord = {
  id: string; title: string; questions: PollQuestions; status: "draft" | "published" | "deleted";
  publication_date: string | null; published_at: Date | null; eligible_owner_ids: string[] | null; legacy: boolean;
};
let initialized: Promise<void> | null = null;

export class PollError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** All setup is additive. Existing vote keys, answers and counts are never rewritten. */
export function initializePoolPoll() {
  if (!initialized) initialized = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pool_poll_votes (
        poll_id text NOT NULL, owner_id text NOT NULL REFERENCES draft_rosters(id),
        answers jsonb NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (poll_id, owner_id)
      );
      CREATE TABLE IF NOT EXISTS pool_polls (
        id text PRIMARY KEY, title text NOT NULL, questions jsonb NOT NULL,
        status text NOT NULL DEFAULT 'draft', publication_date date,
        published_at timestamptz, eligible_owner_ids jsonb, legacy boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pool_polls_publication_date ON pool_polls(publication_date);
      CREATE TABLE IF NOT EXISTS pool_poll_views (
        poll_id text NOT NULL REFERENCES pool_polls(id), owner_id text NOT NULL REFERENCES draft_rosters(id),
        viewed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (poll_id, owner_id)
      );
    `);
    // The original feature never stored a publication date. Preserve it as an
    // undated historical record rather than inventing/relabeling it as today's poll.
    await pool.query(`INSERT INTO pool_polls(id,title,questions,status,legacy)
      VALUES($1,$2,$3,'published',true) ON CONFLICT(id) DO NOTHING`,
    [POOL_POLL.id, POOL_POLL.title, JSON.stringify(POOL_POLL.questions)]);
  })().catch(error => { initialized = null; throw error; });
  return initialized;
}

async function eligibleOwners() {
  const accounts = await participantAccounts();
  return accounts.filter(a => !a.disabled && !!a.email).map(a => a.ownerId);
}

async function record(query: Query, id: string, lock = false, includeDeleted = false) {
  const result = await query.query<PollRecord>(`SELECT *, publication_date::text AS publication_date
    FROM pool_polls WHERE id=$1${includeDeleted ? "" : " AND status<>'deleted'"}${lock ? " FOR UPDATE" : ""}`, [id]);
  if (!result.rows[0]) throw new PollError("Poll not found.", 404);
  return result.rows[0];
}

async function snapshot(query: Query, poll: PollRecord, ownerId: string | null, now: Date, fallbackEligible: string[]) {
  const rows = await query.query<{ owner_id: string; answers: unknown; name: string }>(
    `SELECT v.owner_id,v.answers,r.name FROM pool_poll_votes v
      JOIN draft_rosters r ON r.id=v.owner_id WHERE v.poll_id=$1
      ORDER BY v.submitted_at,v.owner_id`, [poll.id]);
  const valid = rows.rows.flatMap(row => {
    const answers = parsePollAnswers(row.answers, poll.questions);
    return answers ? [{ ownerId: row.owner_id, answers, name: row.name }] : [];
  });
  const mine = ownerId ? valid.find(row => row.ownerId === ownerId) : undefined;
  const eligible = poll.eligible_owner_ids ?? fallbackEligible;
  const closesAt = poll.publication_date ? pollClosesAt(poll.publication_date) : null;
  const isOpen = poll.status === "published" && poll.publication_date === pollCalendarDate(now) &&
    closesAt !== null && now.getTime() < Date.parse(closesAt);
  const viewed = ownerId ? await query.query(`SELECT 1 FROM pool_poll_views WHERE poll_id=$1 AND owner_id=$2`, [poll.id, ownerId]) : null;
  return {
    id: poll.id, title: poll.title, questions: pollResults(valid.map(r => r.answers), poll.questions),
    respondentCount: valid.length, eligibleParticipantCount: eligible.length,
    participants: valid.map(row => ({ name: row.name })),
    structureLocked: rows.rows.length > 0,
    canVote: !!ownerId && eligible.includes(ownerId) && isOpen && !mine,
    hasVoted: !!mine, myAnswers: mine?.answers ?? null, popupViewed: !!viewed?.rowCount,
    status: poll.status, publicationDate: poll.publication_date,
    publishedAt: poll.published_at?.toISOString() ?? null, closesAt, isOpen, legacy: poll.legacy,
  };
}

/** Corrections keep answer identities stable once anyone has voted. */
async function validateEdit(query: Query, existing: PollRecord, questions: PollQuestions) {
  const votes = await query.query(`SELECT 1 FROM pool_poll_votes WHERE poll_id=$1 LIMIT 1`, [existing.id]);
  if (!votes.rowCount) return;
  const sameStructure = existing.questions.length === questions.length &&
    existing.questions.every(oldQuestion => {
      const updated = questions.find(q => q.id === oldQuestion.id);
      return updated && updated.options.length === oldQuestion.options.length &&
        oldQuestion.options.every(option => updated.options.some(o => o.id === option.id));
    });
  if (!sameStructure) throw new PollError(
    "This poll already has votes. You can correct wording, but cannot add or remove questions or answer options.", 409);
}

export function createPollService(dependencies: { now?: () => Date; eligibleOwners?: () => Promise<string[]> } = {}) {
  const clock = dependencies.now ?? (() => new Date());
  const eligibility = dependencies.eligibleOwners ?? eligibleOwners;
  const inTransaction = async <T>(run: (client: Query) => Promise<T>) => {
    await initializePoolPoll();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const read = async (id: string, ownerId: string | null) => {
    await initializePoolPoll();
    return snapshot(pool, await record(pool, id), ownerId, clock(), await eligibility());
  };
  const daily = async (ownerId: string | null) => {
    await initializePoolPoll();
    const now = clock();
    const today = pollCalendarDate(now);
    const yesterday = shiftPollDate(today, -1);
    const result = await pool.query<PollRecord>(`SELECT *, publication_date::text AS publication_date FROM pool_polls
      WHERE status='published' AND publication_date IN ($1::date,$2::date) ORDER BY pool_polls.publication_date DESC`, [today, yesterday]);
    const eligible = await eligibility();
    return { today, yesterday, serverNow: now.toISOString(), rollsOverAt: pollClosesAt(today),
      polls: await Promise.all(result.rows.map(p => snapshot(pool, p, ownerId, now, eligible))) };
  };
  const saveDraft = async (input: unknown) => {
    const draft = parsePollDraft(input);
    if (!draft) throw new PollError("Enter a title, 1–5 questions, and 2–6 distinct answer options per question.");
    const id = draft.id ?? randomUUID();
    await inTransaction(async client => {
      if (draft.id) {
        const existing = await record(client, id, true);
        if (existing.status !== "draft") throw new PollError("Use the administrator Edit action to update a published poll.", 409);
        await client.query(`UPDATE pool_polls SET title=$2,questions=$3,updated_at=now() WHERE id=$1`,
          [id, draft.title, JSON.stringify(draft.questions)]);
      } else {
        await client.query(`INSERT INTO pool_polls(id,title,questions) VALUES($1,$2,$3)`,
          [id, draft.title, JSON.stringify(draft.questions)]);
      }
    });
    return read(id, null);
  };
  const preview = async (input: unknown) => {
    const draft = parsePollDraft(input);
    if (!draft) throw new PollError("Enter a title, 1–5 questions, and 2–6 distinct answer options per question.");
    await initializePoolPoll();
    if (draft.id) await validateEdit(pool, await record(pool, draft.id), draft.questions);
    return snapshot(pool, { id: draft.id ?? "preview", title: draft.title, questions: draft.questions,
      status: "draft", publication_date: null, published_at: null, eligible_owner_ids: await eligibility(), legacy: false },
    null, clock(), []);
  };
  const update = async (input: unknown) => {
    const draft = parsePollDraft(input);
    if (!draft?.id) throw new PollError("Select a saved poll and enter valid title, questions, and answer options.");
    const id = draft.id;
    await inTransaction(async client => {
      const existing = await record(client, id, true);
      await validateEdit(client, existing, draft.questions);
      await client.query(`UPDATE pool_polls SET title=$2,questions=$3,updated_at=now() WHERE id=$1`,
        [id, draft.title, JSON.stringify(draft.questions)]);
    });
    return read(id, null);
  };
  const remove = async (id: string) => {
    await inTransaction(async client => {
      await record(client, id, true, true);
      // Keep a private tombstone: votes, once-only popup claims and the day's
      // publication reservation survive removal and cannot be resurrected.
      await client.query(`UPDATE pool_polls SET status='deleted',updated_at=now() WHERE id=$1`, [id]);
    });
    return { pollId: id, deleted: true };
  };
  const publish = async (id: string) => {
    await inTransaction(async client => {
      // Serialize publication across drafts, server processes and simultaneous taps.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('hockey-pool:daily-poll-publication'))`);
      const poll = await record(client, id, true);
      if (poll.status === "published") return; // Retry never republishes or resets any votes.
      const today = pollCalendarDate(clock());
      const existing = await client.query(`SELECT id FROM pool_polls WHERE publication_date=$1`, [today]);
      if (existing.rowCount) throw new PollError("A poll has already been published for today in Toronto.", 409);
      const eligible = [...new Set(await eligibility())];
      if (!eligible.length) throw new PollError("No eligible pool participants are configured.", 409);
      await client.query(`UPDATE pool_polls SET status='published',publication_date=$2,published_at=$3,
        eligible_owner_ids=$4,updated_at=now() WHERE id=$1`, [id, today, clock(), JSON.stringify(eligible)]);
    });
    return read(id, null);
  };
  const vote = async (id: string, ownerId: string, value: unknown) => {
    await inTransaction(async client => {
      const poll = await record(client, id, true);
      const answers = parsePollAnswers(value, poll.questions);
      if (!answers) throw new PollError("Choose one valid answer for each question in this poll.");
      const existing = await client.query(`SELECT 1 FROM pool_poll_votes WHERE poll_id=$1 AND owner_id=$2`, [id, ownerId]);
      if (existing.rowCount) return; // Includes safe retry of a saved vote after midnight.
      const state = await snapshot(client, poll, ownerId, clock(), await eligibility());
      if (!state.isOpen) throw new PollError("Voting closed.", 409);
      if (!state.canVote) throw new PollError("Only eligible pool participants may vote.", 403);
      await client.query(`INSERT INTO pool_poll_votes(poll_id,owner_id,answers) VALUES($1,$2,$3)
        ON CONFLICT(poll_id,owner_id) DO NOTHING`, [id, ownerId, JSON.stringify(answers)]);
    });
    return read(id, ownerId);
  };
  const claimPopup = async (ownerId: string) => inTransaction(async client => {
    const today = pollCalendarDate(clock());
    const result = await client.query<PollRecord>(`SELECT *, publication_date::text AS publication_date FROM pool_polls
      WHERE status='published' AND publication_date=$1 FOR UPDATE`, [today]);
    const poll = result.rows[0];
    if (!poll) return { poll: null };
    const state = await snapshot(client, poll, ownerId, clock(), await eligibility());
    if (!state.canVote) return { poll: null };
    const saved = await client.query(`INSERT INTO pool_poll_views(poll_id,owner_id) VALUES($1,$2)
      ON CONFLICT(poll_id,owner_id) DO NOTHING RETURNING owner_id`, [poll.id, ownerId]);
    return { poll: saved.rowCount ? { ...state, popupViewed: true } : null };
  });
  const admin = async () => {
    await initializePoolPoll();
    const result = await pool.query<PollRecord>(`SELECT *, publication_date::text AS publication_date
      FROM pool_polls WHERE status<>'deleted' ORDER BY created_at DESC`);
    const eligible = await eligibility();
    return { polls: await Promise.all(result.rows.map(p => snapshot(pool, p, null, clock(), eligible))) };
  };
  return { read, daily, saveDraft, preview, update, remove, publish, vote, claimPopup, admin };
}

export const pollService = createPollService();
/** Compatibility for the original feature: original record and vote identity remain accessible. */
export const readPoolPoll = (ownerId: string | null) => pollService.read(POOL_POLL.id, ownerId);
export const recordPoolPollVote = (ownerId: string, answers: PollAnswers) => pollService.vote(POOL_POLL.id, ownerId, answers);
