import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { draftRostersTable } from "./draft-rosters";

export const poolPollVotesTable = pgTable("pool_poll_votes", {
  pollId: text("poll_id").notNull(),
  ownerId: text("owner_id").notNull().references(() => draftRostersTable.id),
  answers: jsonb("answers").$type<Record<string, string>>().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.pollId, table.ownerId] })]);
