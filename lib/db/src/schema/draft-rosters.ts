import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const ownershipScoreSchema = z.object({
  goals: z.number().nullable(), assists: z.number().nullable(),
  powerPlayGoals: z.number().nullable(), shortHandedGoals: z.number().nullable(),
  overtimeGoals: z.number().nullable(), poolPoints: z.number().nullable(),
  gamesPlayed: z.number().nullable(), wins: z.number().nullable(), shutouts: z.number().nullable(),
});

export const draftRosterSelectionSchema = z.object({
  round: z.number().int(),
  originalText: z.string(),
  assetType: z.enum(["skater", "goalieTeam"]),
  position: z.enum(["F", "D", "G"]),
  reviewNote: z.string().nullable(),
  confirmedName: z.string().nullable().optional(),
  confirmedTeam: z.string().nullable().optional(),
  confirmedLastName: z.string().nullable().optional(),
  nhlPlayerId: z.number().int().positive().nullable().optional(),
  identityCheckedAt: z.string().nullable().optional(),
  identitySource: z.string().nullable().optional(),
  acquiredAt: z.string().datetime().nullable().optional(),
  droppedAt: z.string().datetime().nullable().optional(),
  frozenScoring: ownershipScoreSchema.optional(),
  scoringBaseline: ownershipScoreSchema.optional(),
  scoringExcludedGameIds: z.array(z.number().int()).optional(),
  ownershipDailyBaselines: z.record(z.string(), ownershipScoreSchema).optional(),
  frozenDailyScoring: z.record(z.string(), ownershipScoreSchema).optional(),
  frozenGoalieScoring: z.record(z.string(), ownershipScoreSchema).optional(),
  frozenDailyGoalieScoring: z.record(z.string(), z.record(z.string(), ownershipScoreSchema)).optional(),
  eligibilityPolicy: z.literal("scheduled-minus-one-minute").optional(),
  eligibilityPending: z.boolean().optional(),
  eligibilityCheckedAt: z.string().datetime().optional(),
  adminGoalies: z.array(z.object({
    nhlPlayerId: z.number().int().positive(), confirmedName: z.string(), confirmedTeam: z.string(), identitySource: z.string(),
  })).optional(),
  eligibilityGames: z.array(z.object({
    gameId: z.number().int(),
    gameDate: z.string(),
    scheduledStart: z.string().nullable(),
    cutoff: z.string().nullable(),
    eligible: z.boolean().nullable(),
    overriddenByAdministrator: z.boolean().optional(),
  })).optional(),
  eligibleAfterGameDate: z.string().optional(),
  voidedAt: z.string().datetime().optional(),
  identityCandidates: z.array(z.object({
    nhlPlayerId: z.number().int().positive(),
    name: z.string(),
    team: z.string(),
    position: z.enum(["F", "D"]),
  })).optional(),
});

export type DraftRosterSelection = z.infer<typeof draftRosterSelectionSchema>;

export const draftRostersTable = pgTable("draft_rosters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  selections: jsonb("selections")
    .$type<DraftRosterSelection[]>()
    .notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  source: text("source").notNull().default("draftBoard"),
});

export const insertDraftRosterSchema = createInsertSchema(draftRostersTable)
  .omit({ importedAt: true })
  .extend({ selections: z.array(draftRosterSelectionSchema) });

export type InsertDraftRoster = z.infer<typeof insertDraftRosterSchema>;
export type DraftRoster = typeof draftRostersTable.$inferSelect;