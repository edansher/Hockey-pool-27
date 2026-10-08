import { eq } from "drizzle-orm";
import { db, draftRostersTable, scoringRulesTable } from "@workspace/db";
import { UpdateScoringRulesBody } from "@workspace/api-zod";
import { POOL_SCORING_RULES_ID } from "./scoring-rules-store";
import { TransactionError } from "./transaction-policy";

type PoolTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const scoringRulesUpdateSchema = UpdateScoringRulesBody.strict();

/** Lock in the same order as swaps: rosters first, then the scoring configuration. */
export async function saveScoringRules(
  tx: PoolTransaction, body: unknown, now = new Date(),
) {
  const parsed = scoringRulesUpdateSchema.safeParse(body);
  if (!parsed.success) throw new TransactionError("Provide all scoring values (0–1000), both bonus settings, the current revision and historical application mode.", 400);
  const { expectedRevision, applyMode: _mode, ...config } = parsed.data;
  const rosters = await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id).for("update");
  const [record] = await tx.select().from(scoringRulesTable)
    .where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID)).for("update");
  if (!record) throw new TransactionError("Saved scoring rules are unavailable.", 503);
  if (record.revision !== expectedRevision) {
    throw new TransactionError("Another administrator changed the scoring rules. Reload the latest rules before saving.", 409);
  }
  const changed = Object.entries(config).some(([key, value]) => record.config[key] !== value);
  if (!changed) return { ...config, revision: record.revision, effectiveFrom: record.effectiveFrom };

  // Older swaps retain aggregate live-game baselines, not the exact event facts
  // needed to reprice them under different rules. Never guess or credit points
  // earned before pickup. Zero baselines and frozen dropped-player credits are safe.
  if (rosters.some(roster => roster.selections.some(selection => !selection.droppedAt &&
    [selection.scoringBaseline, ...Object.values(selection.ownershipDailyBaselines ?? {})]
      .some(baseline => baseline && (
        baseline.poolPoints !== 0 || (baseline.goals ?? 0) !== 0 || (baseline.assists ?? 0) !== 0
      ))))) {
    throw new TransactionError("A pickup has a nonzero live-game scoring cutoff. These rules cannot be changed safely without its original event history; no changes were saved.", 409);
  }
  const [saved] = await tx.update(scoringRulesTable).set({
    config, revision: record.revision + 1, effectiveFrom: now,
  }).where(eq(scoringRulesTable.id, record.id)).returning();
  if (!saved) throw new Error("Scoring-rule update was not saved.");
  return { ...config, revision: saved.revision, effectiveFrom: saved.effectiveFrom };
}