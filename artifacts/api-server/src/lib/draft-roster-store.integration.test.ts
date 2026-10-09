import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { asc, eq, inArray } from "drizzle-orm";
import type { DraftRosterSelection } from "@workspace/db";
import { draftRosters } from "../data/draft-rosters";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

test("PostgreSQL row locking preserves a concurrent manual draft choice", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is unavailable; PostgreSQL integration test skipped.");
    return;
  }

  const [
    { db, pool, draftRostersTable },
    { lockDraftRosterRowsForEnrichment, persistEnrichedDraftRosterRows },
  ] = await Promise.all([
    import("@workspace/db"),
    import("./draft-roster-store"),
  ]);
  const ownerIds = draftRosters.map(roster => roster.id);
  const temporaryOwnerId = `__draft_identity_lock_test_${randomUUID()}`;
  const baselineRows = await db.select({
    id: draftRostersTable.id,
    selections: draftRostersTable.selections,
  }).from(draftRostersTable)
    .where(inArray(draftRostersTable.id, ownerIds))
    .orderBy(asc(draftRostersTable.id));

  let rowInserted = false;
  let backfillGate: ReturnType<typeof deferred> | undefined;
  let updaterPromise: Promise<unknown> | undefined;
  let manualWritePromise: Promise<unknown> | undefined;
  let releaseManualClient: (() => Promise<void>) | undefined;
  let manualTransactionOpen = false;

  try {
    try {
      await db.insert(draftRostersTable).values({
        id: temporaryOwnerId,
        name: "Isolated identity lock integration test",
        selections: [{
          round: 1,
          originalText: "Temporary unknown pick",
          assetType: "skater",
          position: "F",
          reviewNote: null,
          confirmedName: "Initial placeholder",
        }],
      });
      rowInserted = true;

      const lockAcquired = deferred();
      backfillGate = deferred();
      updaterPromise = db.transaction(async transaction => {
        const lockedRows = await lockDraftRosterRowsForEnrichment(
          transaction,
          [temporaryOwnerId],
        );
        assert.equal(lockedRows.length, 1);
        lockAcquired.resolve();
        await backfillGate!.promise;
        return persistEnrichedDraftRosterRows(transaction, lockedRows);
      });
      await lockAcquired.promise;

      const manualClient = await pool.connect();
      releaseManualClient = async () => {
        if (manualTransactionOpen) {
          await manualClient.query("ROLLBACK").catch(() => undefined);
        }
        manualClient.release();
      };
      await manualClient.query("BEGIN");
      manualTransactionOpen = true;
      const staleRead = await manualClient.query(
        "SELECT selections FROM draft_rosters WHERE id = $1",
        [temporaryOwnerId],
      );
      assert.equal(staleRead.rowCount, 1);
      const staleSelections = staleRead.rows[0]!.selections as DraftRosterSelection[];
      const manualSelections = staleSelections.map(selection => ({
        ...selection,
        confirmedName: "Concurrent manual choice",
      }));
      const [{ pid: backendPid }] = (
        await manualClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
      ).rows;
      assert.ok(backendPid);
      let manualWriteFinished = false;
      manualWritePromise = manualClient.query(
        "UPDATE draft_rosters SET selections = $1::jsonb WHERE id = $2",
        [JSON.stringify(manualSelections), temporaryOwnerId],
      ).then(result => {
        manualWriteFinished = true;
        return result;
      });

      let observedLockWait = false;
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const status = await pool.query(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
          [backendPid],
        );
        if (status.rows[0]?.wait_event_type === "Lock") {
          observedLockWait = true;
          break;
        }
        if (manualWriteFinished) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (observedLockWait) {
        backfillGate.resolve();
        await updaterPromise;
        await manualWritePromise;
        await manualClient.query("COMMIT");
        manualTransactionOpen = false;
      } else if (manualWriteFinished) {
        await manualWritePromise;
        await manualClient.query("COMMIT");
        manualTransactionOpen = false;
        backfillGate.resolve();
        await updaterPromise;
      } else {
        // Allow cleanup to complete if pg_stat_activity cannot report the wait.
        backfillGate.resolve();
        await updaterPromise;
        await manualWritePromise;
        await manualClient.query("COMMIT");
        manualTransactionOpen = false;
      }

      assert.equal(
        observedLockWait,
        true,
        "the concurrent UPDATE should wait on the updater's PostgreSQL row lock",
      );
      const [finalRow] = await db.select({
        selections: draftRostersTable.selections,
      }).from(draftRostersTable)
        .where(eq(draftRostersTable.id, temporaryOwnerId));
      assert.equal(finalRow?.selections[0]?.confirmedName, "Concurrent manual choice");
    } finally {
      backfillGate?.resolve();
      if (updaterPromise) await updaterPromise.catch(() => undefined);
      if (manualWritePromise) await manualWritePromise.catch(() => undefined);
      await releaseManualClient?.();
      if (rowInserted) {
        await db.transaction(async transaction => {
          await transaction.delete(draftRostersTable)
            .where(eq(draftRostersTable.id, temporaryOwnerId));
        });
      }
    }

    const rowsAfterCleanup = await db.select({
      id: draftRostersTable.id,
      selections: draftRostersTable.selections,
    }).from(draftRostersTable)
      .where(inArray(draftRostersTable.id, ownerIds))
      .orderBy(asc(draftRostersTable.id));
    assert.deepEqual(rowsAfterCleanup, baselineRows, "the original 180 picks must be unchanged");
  } finally {
    await pool.end();
  }
});