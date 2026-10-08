import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scoringRulesTable = pgTable("pool_scoring_rules", {
  id: text("id").primaryKey(),
  config: jsonb("config").$type<Record<string, number | boolean>>().notNull(),
  revision: integer("revision").notNull().default(1),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
});
export const insertScoringRulesSchema = createInsertSchema(scoringRulesTable)
  .omit({ effectiveFrom: true })
  .extend({ config: z.record(z.string(), z.union([z.number().finite().nonnegative(), z.boolean()])) });
export type InsertScoringRules = z.infer<typeof insertScoringRulesSchema>;
export type ScoringRulesRecord = typeof scoringRulesTable.$inferSelect;