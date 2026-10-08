import { pgTable, text, timestamp, uniqueIndex, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { draftRostersTable } from "./draft-rosters";

/** Only committed, completed drop/pickup pairs belong in this permanent ledger. */
export const poolTransactionsTable = pgTable("pool_transactions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => draftRostersTable.id),
  ownerName: text("owner_name").notNull(),
  outgoingPlayerId: text("outgoing_player_id").notNull(),
  outgoingPlayerName: text("outgoing_player_name").notNull(),
  incomingPlayerId: text("incoming_player_id").notNull(),
  incomingPlayerName: text("incoming_player_name").notNull(),
  createdBy: text("created_by").notNull(),
  requestId: text("request_id").notNull(),
  paid: boolean("paid").notNull().default(false),
  paymentChangedAt: timestamp("payment_changed_at", { withTimezone: true }),
  paymentChangedBy: text("payment_changed_by"),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversedBy: text("reversed_by"),
  transactionNumber: integer("transaction_number"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("pool_transactions_owner_request").on(table.ownerId, table.requestId)]);

export const insertPoolTransactionSchema = createInsertSchema(poolTransactionsTable)
  .omit({ createdAt: true, effectiveAt: true });
export type PoolTransaction = typeof poolTransactionsTable.$inferSelect;
export type InsertPoolTransaction = typeof poolTransactionsTable.$inferInsert;