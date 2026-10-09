import { eq } from 'drizzle-orm';
import { db, poolTransactionsTable } from '@workspace/db';
import { TransactionError } from './transaction-policy';
import { recordAudit } from "./pool-audit";

type LedgerTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Call inside a DB transaction, after verified administrator authorization. */
export async function setTransactionPayment(
  tx: LedgerTransaction, id: string, paid: boolean, actor: string, now = new Date(),
) {
  const [current] = await tx.select().from(poolTransactionsTable)
    .where(eq(poolTransactionsTable.id, id)).for('update');
  if (!current) throw new TransactionError('Transaction not found.', 404);
  // Retries are idempotent and retain the original receipt metadata.
  if (current.paid === paid) return current;
  if (current.reversedAt) throw new TransactionError("A reversed transaction has no outstanding fee.", 409);
  const [saved] = await tx.update(poolTransactionsTable).set({
    paid, paymentChangedAt: now, paymentChangedBy: actor,
  }).where(eq(poolTransactionsTable.id, id)).returning();
  await recordAudit(tx, actor, "payment", paid ? "Fee marked paid" : "Payment receipt corrected to unpaid",
    { transactionId: id, before: current.paid, after: paid, changedAt: now.toISOString() });
  return saved!;
}