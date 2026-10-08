import { boolean, date, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { draftRostersTable } from "./draft-rosters";

export const poolPollsTable = pgTable("pool_polls", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  questions: jsonb("questions").$type<Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>>().notNull(),
  status: text("status").notNull().default("draft"),
  publicationDate: date("publication_date"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  eligibleOwnerIds: jsonb("eligible_owner_ids").$type<string[]>(),
  legacy: boolean("legacy").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pool_polls_publication_date").on(table.publicationDate)]);

export const poolPollViewsTable = pgTable("pool_poll_views", {
  pollId: text("poll_id").notNull().references(() => poolPollsTable.id),
  ownerId: text("owner_id").notNull().references(() => draftRostersTable.id),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.pollId, table.ownerId] })]);
