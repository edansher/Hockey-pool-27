import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool, poolTransactionsTable, draftRostersTable } from '@workspace/db';
import { setTransactionPayment } from './transaction-payment';

// SQL integration evidence without committing a fake drop or changing real fees.
test('payment persists atomically, repeats are idempotent, corrections work; the fixture is rolled back', async () => {
  const id = `payment-test-${randomUUID()}`;
  const rollback = new Error('intentional fixture rollback');
  try {
    await assert.rejects(db.transaction(async tx => {
      const [owner] = await tx.select({ id: draftRostersTable.id }).from(draftRostersTable).limit(1);
      assert.ok(owner, 'A pool roster is required for the isolated ledger fixture');
      const [original] = await tx.insert(poolTransactionsTable).values({
        id, ownerId: owner.id, ownerName: 'Synthetic payment fixture',
        outgoingPlayerId: '1', outgoingPlayerName: 'Outgoing test skater',
        incomingPlayerId: '2', incomingPlayerName: 'Incoming test skater',
        createdBy: 'test', requestId: id,
      }).returning();
      assert.equal(original!.paid, false);
      const now = new Date('2026-10-02T15:00:00Z');
      const paid = await setTransactionPayment(tx, id, true, 'synthetic-admin', now);
      const [persisted] = await tx.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.id, id));
      assert.equal(persisted!.paid, true);
      assert.equal(persisted!.paymentChangedBy, 'synthetic-admin');
      assert.equal(persisted!.paymentChangedAt!.toISOString(), now.toISOString());
      const repeated = await setTransactionPayment(tx, id, true, 'second-actor', new Date());
      assert.equal(repeated.paymentChangedAt!.toISOString(), now.toISOString());
      assert.equal(repeated.paymentChangedBy, 'synthetic-admin');
      const corrected = await setTransactionPayment(tx, id, false, 'synthetic-admin');
      assert.equal(corrected.paid, false);
      for (const row of [paid, repeated, corrected]) {
        const { paid: _paid, paymentChangedAt: _at, paymentChangedBy: _by, ...swap } = row;
        const { paid: _op, paymentChangedAt: _oa, paymentChangedBy: _ob, ...originalSwap } = original!;
        assert.deepEqual(swap, originalSwap);
      }
      await assert.rejects(setTransactionPayment(tx, 'missing-payment-fixture', true, 'test'),
        (error: any) => error.status === 404);
      throw rollback;
    }), error => error === rollback);
    assert.equal((await db.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.id, id))).length, 0);
  } finally { await pool.end(); }
});