import test from "node:test";
import assert from "node:assert/strict";
import { parsePollAnswers, pollResults, pollCalendarDate, pollClosesAt, parsePollDraft, type PollAnswers } from "./pool-poll";

test("requires valid answers to both questions, rejecting missing or extra fields", () => {
  assert.equal(parsePollAnswers(null), null);
  assert.equal(parsePollAnswers({ timing: "too-early" }), null);
  assert.equal(parsePollAnswers({ timing: "other", outlook: "improve" }), null);
  assert.equal(parsePollAnswers({ timing: "too-early", outlook: "improve", ownerId: "cohen" }), null);
  assert.deepEqual(parsePollAnswers({ timing: "good-move", outlook: "hurt" }), { timing: "good-move", outlook: "hurt" });
});

test("zero responses are zero percent, not fabricated results", () => {
  assert.ok(pollResults([]).every(question => question.options.every(option => option.votes === 0 && option.percentage === 0)));
});

test("aggregates actual responses and rounds every question to 100 percent", () => {
  const answers: PollAnswers[] = [
    { timing: "too-early", outlook: "improve" },
    { timing: "good-move", outlook: "no-change" },
    { timing: "good-move", outlook: "hurt" },
  ];
  const [timing, outlook] = pollResults(answers);
  assert.deepEqual(timing.options.map(option => option.votes), [1, 2]);
  assert.deepEqual(timing.options.map(option => option.percentage), [33.3, 66.7]);
  assert.deepEqual(outlook.options.map(option => option.percentage), [33.4, 33.3, 33.3]);
  for (const question of [timing, outlook]) {
    assert.equal(question.options.reduce((sum, option) => sum + option.votes, 0), 3);
    assert.equal(Math.round(question.options.reduce((sum, option) => sum + option.percentage, 0) * 10), 1000);
  }
});

test("daily poll boundaries are Toronto midnight, independent of the pool scoring day", () => {
  assert.equal(pollCalendarDate(new Date("2026-10-08T03:59:59Z")), "2026-10-07");
  assert.equal(pollCalendarDate(new Date("2026-10-08T04:00:00Z")), "2026-10-08");
  assert.equal(pollClosesAt("2026-10-07"), "2026-10-08T04:00:00.000Z");
  assert.equal(pollClosesAt("2026-03-07"), "2026-03-08T05:00:00.000Z");
  assert.equal(pollClosesAt("2026-03-08"), "2026-03-09T04:00:00.000Z");
  assert.equal(pollClosesAt("2026-10-31"), "2026-11-01T04:00:00.000Z");
  assert.equal(pollClosesAt("2026-11-01"), "2026-11-02T05:00:00.000Z");
});

test("new questions retain stable identities and validate distinct complete answers", () => {
  const questions = [{ id: "daily", prompt: "A new topic?", options: [{ id: "a", label: "Yes" }, { id: "b", label: "No" }] }];
  assert.deepEqual(parsePollAnswers({ daily: "a" }, questions), { daily: "a" });
  assert.equal(parsePollAnswers({ timing: "too-early" }, questions), null);
  assert.equal(parsePollAnswers({ daily: "c" }, questions), null);
  assert.ok(parsePollDraft({ title: "What do you think?", questions }));
  assert.equal(parsePollDraft({ title: "", questions }), null);
  assert.equal(parsePollDraft({ title: "Poll", questions: [{ ...questions[0], options: [{ id: "a", label: "Yes" }] }] }), null);
  assert.equal(parsePollDraft({ title: "Poll", questions: [{ ...questions[0], options: [{ id: "a", label: "Yes" }, { id: "a", label: "No" }] }] }), null);
  assert.equal(pollResults([], questions)[0].options[0].percentage, 0);
});
