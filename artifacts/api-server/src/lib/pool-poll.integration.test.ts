import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { db, pool, draftRostersTable } from "@workspace/db";
import { createPoolPollRouter } from "../routes/pool-poll";
import { POOL_POLL } from "./pool-poll";
import { createPollService, initializePoolPoll } from "./pool-poll-store";

type PollResponse = Awaited<ReturnType<ReturnType<typeof createPollService>["read"]>>;

test("daily polls: isolated persistent votes, admin controls, atomic publication/popups and midnight rotation", async () => {
  const schema = `poll_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const options = pool as unknown as { options: { options?: string } };
  const previousOptions = options.options.options;
  options.options.options = `-c search_path=${schema}`;
  await pool.query(`SET search_path TO "${schema}"`);
  let now = new Date("2026-10-07T16:00:00Z");
  const owners = ["poll-fixture-a", "poll-fixture-b"];
  const service = createPollService({ now: () => now, eligibleOwners: async () => owners });
  const app = express();
  app.use(express.json());
  app.use("/api", createPoolPollRouter(async req => {
    const ownerId = req.header("test-owner") ?? null;
    return { authenticated: req.header("test-auth") === "yes", authorized: !!ownerId,
      ownerId, isAdmin: req.header("test-admin") === "yes" && req.header("test-auth") === "yes" };
  }, service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/poll`;
  const request = async (path: string, body?: unknown, owner?: string, admin = false, authenticated = true) => {
    const response = await fetch(url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(authenticated ? { "test-auth": "yes" } : {}),
        ...(owner ? { "test-owner": owner } : {}), ...(admin ? { "test-admin": "yes" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as PollResponse & {
      polls: PollResponse[]; poll: PollResponse | null; today: string; yesterday: string; error?: string; deleted?: boolean;
    } };
  };
  const draft = {
    title: "What do you think?", questions: [{
      id: "daily", prompt: "Was the latest move a good choice?",
      options: [{ id: "a", label: "Yes" }, { id: "b", label: "Too early" }],
    }],
  };
  try {
    await pool.query(`CREATE TABLE "${schema}".draft_rosters (LIKE public.draft_rosters INCLUDING ALL)`);
    await db.insert(draftRostersTable).values(owners.map((id, index) => ({ id, name: `Fixture ${index ? "B" : "A"}`, selections: [] })));
    await initializePoolPoll();
    // Pre-existing original answers are kept byte-for-byte under the original ID.
    const originalAnswers = { timing: "too-early", outlook: "improve" };
    await pool.query(`INSERT INTO pool_poll_votes(poll_id,owner_id,answers) VALUES($1,$2,$3)`,
      [POOL_POLL.id, owners[0], JSON.stringify(originalAnswers)]);
    const legacy = await service.read(POOL_POLL.id, owners[0]);
    assert.equal(legacy.respondentCount, 1);
    assert.deepEqual(legacy.myAnswers, originalAnswers);
    assert.equal(legacy.questions[0].options[0].percentage, 100);
    assert.equal(legacy.publicationDate, null);
    assert.deepEqual((await request("/daily")).body.polls, []);
    for (const path of ["/admin/drafts", "/admin/preview", "/admin/publish", "/admin/edit", "/admin/delete"]) {
      assert.equal((await request(path, draft, owners[0])).status, 403);
      assert.equal((await request(path, draft, undefined, false, false)).status, 401);
    }
    assert.equal((await request("/admin", undefined, owners[0])).status, 403);
    const disposable = await request("/admin/drafts", draft, undefined, true);
    assert.equal((await request("/admin/delete", { pollId: disposable.body.id }, owners[0])).status, 403);
    const deletion = await request("/admin/delete", { pollId: disposable.body.id }, undefined, true);
    assert.equal(deletion.status, 200);
    assert.equal(deletion.body.deleted, true);
    assert.equal((await request("/admin/delete", { pollId: disposable.body.id }, undefined, true)).status, 200);
    assert.ok(!(await service.admin()).polls.some(p => p.id === disposable.body.id));
    await assert.rejects(() => service.read(disposable.body.id, null), { status: 404 });
    const preview = await request("/admin/preview", draft, undefined, true);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.respondentCount, 0);
    const saved = await request("/admin/drafts", draft, undefined, true);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.status, "draft");
    assert.deepEqual((await request("/daily")).body.polls, []);
    assert.equal((await request("/popup", {}, owners[0])).body.poll, null);
    const edited = await request("/admin/drafts", { ...draft, id: saved.body.id, title: "Saved daily poll" }, undefined, true);
    assert.equal(edited.body.title, "Saved daily poll");
    const otherDraft = await request("/admin/drafts", draft, undefined, true);
    const publishes = await Promise.all(Array.from({ length: 5 }, () =>
      request("/admin/publish", { pollId: saved.body.id }, undefined, true)));
    assert.ok(publishes.every(r => r.status === 200 && r.body.id === saved.body.id));
    assert.equal((await request("/admin/publish", { pollId: otherDraft.body.id }, undefined, true)).status, 409);
    const daily = (await request("/daily", undefined, owners[0])).body;
    assert.equal(daily.polls.length, 1);
    assert.equal(daily.polls[0].publicationDate, "2026-10-07");
    assert.equal(daily.polls[0].eligibleParticipantCount, 2);
    assert.equal(daily.polls[0].isOpen, true);
    assert.deepEqual(daily.polls[0].participants, []);
    assert.equal(daily.polls[0].structureLocked, false);
    assert.equal((await request("/admin/drafts", { ...draft, id: saved.body.id }, undefined, true)).status, 409);
    const corrected = await request("/admin/edit", { ...draft, id: saved.body.id, title: "Corrected daily poll" }, undefined, true);
    assert.equal(corrected.status, 200);
    assert.equal(corrected.body.title, "Corrected daily poll");
    assert.equal(corrected.body.status, "published");
    assert.equal(corrected.body.publicationDate, daily.polls[0].publicationDate);
    assert.equal(corrected.body.publishedAt, daily.polls[0].publishedAt);
    assert.equal(corrected.body.closesAt, daily.polls[0].closesAt);
    assert.equal((await request("/admin/preview", { ...draft, id: saved.body.id }, undefined, true)).status, 200);
    const claims = await Promise.all(Array.from({ length: 8 }, () => request("/popup", {}, owners[0])));
    assert.equal(claims.filter(r => r.body.poll).length, 1);
    assert.equal((await request("/popup", {}, owners[0])).body.poll, null);
    const dismissed = (await request("/daily", undefined, owners[0])).body.polls[0];
    assert.equal(dismissed.popupViewed, true);
    assert.equal(dismissed.hasVoted, false);
    assert.equal(dismissed.canVote, true);
    assert.equal((await request("/votes", { pollId: saved.body.id, answers: { daily: "a" } }, undefined, false, false)).status, 401);
    assert.equal((await request("/votes", { pollId: saved.body.id, answers: { daily: "a" } })).status, 403);
    assert.equal((await request("/votes", { pollId: saved.body.id, answers: { daily: "bogus" } }, owners[0])).status, 400);
    const votes = await Promise.all(Array.from({ length: 8 }, () => request("/votes",
      { pollId: saved.body.id, answers: { daily: "a" }, ownerId: owners[1] }, owners[0])));
    assert.ok(votes.every(r => r.status === 200));
    assert.ok(votes.every(r => r.body.respondentCount === 1));
    const retry = (await request("/votes", { pollId: saved.body.id, answers: { daily: "b" } }, owners[0])).body;
    assert.deepEqual(retry.myAnswers, { daily: "a" });
    const beforeVote = (await request("/daily", undefined, owners[1])).body.polls[0];
    assert.equal(beforeVote.hasVoted, false);
    assert.equal(beforeVote.respondentCount, 1);
    assert.deepEqual(beforeVote.participants, [{ name: "Fixture A" }]);
    assert.equal(beforeVote.myAnswers, null);
    assert.equal(beforeVote.structureLocked, true);
    const wordingFix = { ...draft, id: saved.body.id, title: "Corrected title", questions: [{
      ...draft.questions[0], prompt: "Corrected question wording",
      options: [{ id: "a", label: "Good move" }, { id: "b", label: "Too early" }],
    }] };
    const fixed = await request("/admin/edit", wordingFix, undefined, true);
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.respondentCount, 1);
    assert.equal(fixed.body.questions[0].options[0].label, "Good move");
    assert.equal(fixed.body.questions[0].options[0].percentage, 100);
    assert.deepEqual((await service.read(saved.body.id, owners[0])).myAnswers, { daily: "a" });
    assert.equal((await request("/popup", {}, owners[0])).body.poll, null);
    assert.equal((await request("/admin/preview", wordingFix, undefined, true)).status, 200);
    const changedStructure = { ...wordingFix, questions: [{
      ...wordingFix.questions[0], options: [...wordingFix.questions[0].options, { id: "c", label: "Unsure" }],
    }] };
    assert.equal((await request("/admin/edit", changedStructure, undefined, true)).status, 409);
    assert.equal((await request("/admin/preview", changedStructure, undefined, true)).status, 409);
    assert.equal((await request("/admin/edit", { ...wordingFix, title: "" }, undefined, true)).status, 400);
    assert.equal((await service.read(saved.body.id, null)).title, "Corrected title");
    // Close even without publishing a replacement. A page held open cannot vote late.
    now = new Date("2026-10-08T04:00:00Z");
    assert.equal((await request("/votes", { pollId: saved.body.id, answers: { daily: "b" } }, owners[1])).status, 409);
    const yesterday = (await request("/daily", undefined, owners[0])).body;
    assert.equal(yesterday.today, "2026-10-08");
    assert.equal(yesterday.polls[0].publicationDate, yesterday.yesterday);
    assert.equal(yesterday.polls[0].isOpen, false);
    assert.equal(yesterday.polls[0].canVote, false);
    assert.deepEqual(yesterday.polls[0].myAnswers, { daily: "a" });
    assert.equal((await request("/popup", {}, owners[1])).body.poll, null);
    // New day: publication, popup and voting are independent of the first poll.
    const next = await request("/admin/publish", { pollId: otherDraft.body.id }, undefined, true);
    assert.equal(next.status, 200);
    assert.equal(next.body.publicationDate, "2026-10-08");
    assert.ok((await request("/popup", {}, owners[0])).body.poll);
    const firstNext = (await request("/votes", { pollId: next.body.id, answers: { daily: "a" } }, owners[0])).body;
    assert.equal(firstNext.respondentCount, 1);
    const secondNext = (await request("/votes", { pollId: next.body.id, answers: { daily: "b" } }, owners[1])).body;
    assert.equal(secondNext.respondentCount, 2);
    assert.deepEqual(secondNext.participants, [{ name: "Fixture A" }, { name: "Fixture B" }]);
    assert.deepEqual(secondNext.questions[0].options.map((o: { percentage: number }) => o.percentage), [50, 50]);
    assert.equal((await request("/daily")).body.polls.length, 2);
    now = new Date("2026-10-09T04:00:00Z");
    assert.equal((await request("/daily")).body.polls.length, 1);
    now = new Date("2026-10-10T04:00:00Z");
    assert.equal((await request("/daily")).body.polls.length, 0);
    const stored = await pool.query(`SELECT count(*)::int AS count FROM pool_poll_votes`);
    assert.equal(stored.rows[0].count, 4);
    assert.deepEqual((await service.read(POOL_POLL.id, owners[0])).myAnswers, originalAnswers);
    assert.equal((await request("/admin", undefined, undefined, true)).body.polls.length, 3);
    const legacyEdit = await request("/admin/edit",
      { id: POOL_POLL.id, title: "Legacy wording corrected", questions: POOL_POLL.questions }, undefined, true);
    assert.equal(legacyEdit.status, 200);
    assert.equal(legacyEdit.body.publicationDate, null);
    assert.deepEqual((await service.read(POOL_POLL.id, owners[0])).myAnswers, originalAnswers);
    // Removing a published poll cannot reset voting, republish it or reclaim its day.
    now = new Date("2026-10-07T18:00:00Z");
    assert.equal((await request("/admin/delete", { pollId: saved.body.id }, undefined, true)).status, 200);
    assert.deepEqual((await request("/daily")).body.polls, []);
    assert.equal((await request("/popup", {}, owners[0])).body.poll, null);
    assert.equal((await request("/votes", { pollId: saved.body.id, answers: { daily: "a" } }, owners[0])).status, 404);
    assert.equal((await request("/admin/edit", wordingFix, undefined, true)).status, 404);
    assert.equal((await request("/admin/publish", { pollId: saved.body.id }, undefined, true)).status, 404);
    const replacement = await request("/admin/drafts", draft, undefined, true);
    assert.equal((await request("/admin/publish", { pollId: replacement.body.id }, undefined, true)).status, 409);
    assert.equal((await request("/admin/delete", { pollId: replacement.body.id }, undefined, true)).status, 200);
    assert.equal((await request("/admin/delete", { pollId: POOL_POLL.id }, undefined, true)).status, 200);
    assert.ok(!(await service.admin()).polls.some(p => p.id === saved.body.id || p.id === POOL_POLL.id));
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM pool_poll_votes`)).rows[0].count, 4);
    assert.equal((await pool.query(`SELECT status FROM pool_polls WHERE id=$1`, [POOL_POLL.id])).rows[0].status, "deleted");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    options.options.options = previousOptions;
    await pool.query(`SET search_path TO public`);
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
