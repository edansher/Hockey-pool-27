import { and, eq, sql } from "drizzle-orm";
import { db, scoringRulesTable } from "@workspace/db";
import {
  DEFAULT_SCORING_RULES,
  type ScoringRules,
} from "./pool-scoring";
import { CONFIRMED_SCORING_EFFECTIVE_FROM, correctedDefensemanHatTrick } from "./scoring-rules-corrections";

export const POOL_SCORING_RULES_ID = "hockey-pool-2026-27";

export interface PersistedScoringRules {
  rules: ScoringRules;
  revision: number;
  effectiveFrom: Date;
}

export async function loadPersistedScoringRules(): Promise<PersistedScoringRules> {
  await db.insert(scoringRulesTable).values({
    id: POOL_SCORING_RULES_ID,
    config: DEFAULT_SCORING_RULES,
    effectiveFrom: CONFIRMED_SCORING_EFFECTIVE_FROM,
  }).onConflictDoNothing();
  let [record] = await db.select().from(scoringRulesTable)
    .where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID));
  if (!record) throw new Error("Saved pool scoring rules are unavailable.");

  const correction = correctedDefensemanHatTrick(record);
  if (correction) {
    const [updated] = await db.update(scoringRulesTable).set({
      config: sql`jsonb_set(${scoringRulesTable.config}, '{defensemanHatTrick}', '10'::jsonb)`,
      revision: correction.revision,
      effectiveFrom: correction.effectiveFrom,
    }).where(and(
      eq(scoringRulesTable.id, POOL_SCORING_RULES_ID),
      eq(scoringRulesTable.revision, 2),
      sql`${scoringRulesTable.config}->>'defensemanHatTrick' = '6'`,
    )).returning();
    // Concurrent readers may have applied the same guarded correction already.
    record = updated ?? (await db.select().from(scoringRulesTable)
      .where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID)))[0];
    if (!record) throw new Error("Corrected pool scoring rules are unavailable.");
  }

  const config = record.config;
  const numericKeys = [
    "goal",
    "assist",
    "powerPlayGoal",
    "shortHandedGoal",
    "overtimeGoal",
    "forwardHatTrick",
    "defensemanHatTrick",
    "goalieTeamWin",
    "goalieTeamShutoutWin",
    "goalieAssist",
    "goalieGoal",
  ] as const;
  for (const key of numericKeys) {
    if (typeof config[key] !== "number" || !Number.isFinite(config[key]) || config[key] < 0) {
      throw new Error(`Saved pool scoring rule ${key} is invalid.`);
    }
  }
  if (
    typeof config.powerPlayBonusOnOvertime !== "boolean" ||
    typeof config.powerPlayBonusOnHatTrick !== "boolean"
  ) {
    throw new Error("Saved pool power-play bonus rules are invalid.");
  }

  const rules = Object.fromEntries([
    ...numericKeys.map(key => [key, config[key]]),
    ["powerPlayBonusOnOvertime", config.powerPlayBonusOnOvertime],
    ["powerPlayBonusOnHatTrick", config.powerPlayBonusOnHatTrick],
  ]) as unknown as ScoringRules;
  return { rules, revision: record.revision, effectiveFrom: record.effectiveFrom };
}