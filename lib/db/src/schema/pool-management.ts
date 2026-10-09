import { pgTable, text, timestamp, uniqueIndex, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { draftRostersTable } from "./draft-rosters";

export const participantAccountsTable = pgTable("pool_participant_accounts", {
  ownerId: text("owner_id").primaryKey().references(() => draftRostersTable.id),
  email: text("email"),
  clerkUserId: text("clerk_user_id"),
  disabled: boolean("disabled").notNull().default(false),
  transactionLimit: integer("transaction_limit").notNull().default(9),
  countAdjustment: integer("count_adjustment").notNull().default(0),
}, t => [uniqueIndex("pool_participant_email_unique").on(t.email), uniqueIndex("pool_participant_user_unique").on(t.clerkUserId)]);
export const poolAuditTable = pgTable("pool_admin_audit", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertParticipantAccountSchema = createInsertSchema(participantAccountsTable);
export const insertPoolAuditSchema = createInsertSchema(poolAuditTable).omit({ createdAt: true });