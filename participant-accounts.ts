import { pgTable, text, timestamp, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { draftRostersTable } from "./draft-rosters";

// A verified email can establish a link once; it cannot transfer a roster.
export const participantAccountLinksTable = pgTable("participant_accounts", {
  ownerId: text("owner_id").notNull().references(() => draftRostersTable.id),
  clerkUserId: text("clerk_user_id").notNull(),
  // Clerk development and production use different account stores.
  clerkEnvironment: text("clerk_environment").notNull().default("development"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.ownerId, table.clerkEnvironment] }),
  uniqueIndex("participant_accounts_user_environment").on(table.clerkUserId, table.clerkEnvironment),
]);
export const insertParticipantAccountLinkSchema = createInsertSchema(participantAccountLinksTable).omit({ linkedAt: true });
export type ParticipantAccountLink = typeof participantAccountLinksTable.$inferSelect;