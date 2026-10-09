import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, scoringRulesTable, draftRostersTable } from "@workspace/db";
import { saveScoringRules, scoringRulesUpdateSchema } from "./scoring-rules-update";
import { loadPersistedScoringRules, POOL_SCORING_RULES_ID } from "./scoring-rules-store";

test("admin scoring updates validate, protect revisions, preserve rosters and roll back all fixture changes", async () => {
  try {
    const before = await loadPersistedScoringRules();
    const input = { ...before.rules, expectedRevision: before.revision, applyMode: "historical" as const };
    for (const invalid of [
      { ...input, goal: -1 }, { ...input, goal: Number.NaN },
      { ...input, goal: Infinity }, { ...input, goal: 1001 },
      { ...input, assist: "2" }, { ...input, powerPlayBonusOnOvertime: "true" },
      { ...input, expectedRevision: 0 }, { ...input, applyMode: "forward" },
      { ...input, revision: 999 }, { ...input, effectiveFrom: new Date().toISOString() },
      { ...input, isAdmin: true },
    ]) assert.equal(scoringRulesUpdateSchema.safeParse(invalid).success, false);
    const { goalieGoal: _missing, ...incomplete } = input;
    assert.equal(scoringRulesUpdateSchema.safeParse(incomplete).success, false);

    const rollback = new Error("intentional scoring fixture rollback");
    await assert.rejects(db.transaction(async tx => {
      const originalRosters = await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id);
      const now = new Date("2026-10-02T20:00:00.000Z");
      const same = await saveScoringRules(tx, input, now);
      assert.equal(same.revision, before.revision, "No-op saves must not bump the revision");
      assert.equal(same.effectiveFrom.toISOString(), before.effectiveFrom.toISOString());
      const changed = await saveScoringRules(tx, { ...input, goal: input.goal + 0.25 }, now);
      assert.equal(changed.goal, input.goal + 0.25);
      assert.equal(changed.revision, input.expectedRevision + 1);
      assert.equal(changed.effectiveFrom.toISOString(), now.toISOString());
      const [saved] = await tx.select().from(scoringRulesTable)
        .where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID));
      assert.equal(saved!.config.goal, changed.goal, "Rules are persisted, not only echoed");
      assert.deepEqual(await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id), originalRosters,
        "Frozen credits, exclusions, ownership timestamps and roster identities must remain unchanged");
      await assert.rejects(saveScoringRules(tx, { ...input, goal: input.goal + 1 }),
        (error: any) => error.status === 409 && /Reload/.test(error.message));
      await assert.rejects(saveScoringRules(tx, { ...input, goal: -1 }),
        (error: any) => error.status === 400);
      const updatedInput = { ...input, expectedRevision: changed.revision };
      const owner = originalRosters.find(row => row.selections.some(selection => !selection.droppedAt && selection.acquiredAt));
      assert.ok(owner, "An existing pickup is needed for the isolated cutoff guard test");
      const selections = owner.selections.map(selection => !selection.droppedAt && selection.acquiredAt ? {
        ...selection, scoringBaseline: {
          goals: 1, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0,
          overtimeGoals: 0, poolPoints: input.goal, gamesPlayed: 1, wins: null, shutouts: null,
        },
      } : selection);
      await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, owner.id));
      await assert.rejects(saveScoringRules(tx, updatedInput),
        (error: any) => error.status === 409 && /cutoff/.test(error.message));
      assert.equal((await tx.select().from(scoringRulesTable)
        .where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID)))[0]!.revision, changed.revision);
      throw rollback;
    }), error => error === rollback);
    const after = await loadPersistedScoringRules();
    assert.deepEqual(after, before, "Real pool rules must not change during the test");
  } finally {
    await pool.end();
  }
});