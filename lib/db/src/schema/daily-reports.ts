import { boolean, date, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const dailyReportsTable = pgTable("daily_reports", {
  reportDate: date("report_date", { mode: "string" }).primaryKey(),
  gamesThroughDate: date("games_through_date", { mode: "string" }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  fingerprint: text("fingerprint").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  corrected: boolean("corrected").notNull().default(false),
});
export const insertDailyReportSchema = createInsertSchema(dailyReportsTable);
export type DailyReportRecord = typeof dailyReportsTable.$inferSelect;