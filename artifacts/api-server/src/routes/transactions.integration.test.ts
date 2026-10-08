import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { db, pool, draftRostersTable, poolTransactionsTable, participantAccountLinksTable, draftRosterSelectionSchema } from "@workspace/db";
import * as schema from "../../../../lib/db/src/schema";
import { createTransactionsRouter } from "./transactions";
import { TransactionError } from "../lib/transaction-policy";
import { participantEmailMap } from "../lib/participant-identity";
import { GetTransactionAccessResponse } from "@workspace/api-zod";
import { resolveParticipantAccount } from "../middlewares/participant-access";

// The complete production writer's scoring/concurrency/rollback lifecycle is
// exercised separately by participant-system.integration.test.ts. This test
// isolates verified ownership and HTTP retry identity, never real transactions.
test("linked authorization denies cross-owner claims before recording and preserves saved request identity", async () => {
  const namespace = `swap_fixture_${randomUUID().replaceAll("-", "")}`;
  const originalLedger = await db.select().from(poolTransactionsTable);
  const originalCohen = (await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, "cohen")))[0]!
    .selections.filter(p => p.droppedAt || p.acquiredAt);
  const client = await pool.connect();
  let server: ReturnType<express.Express["listen"]> | undefined;
  try {
    await client.query(`CREATE SCHEMA ${namespace}`);
    for (const name of ["draft_rosters", "pool_transactions", "participant_accounts"]) {
      await client.query(`CREATE TABLE ${namespace}.${name} (LIKE public.${name} INCLUDING ALL)`);
    }
    await client.query(`SET search_path TO ${namespace}`);
    const fixture = drizzle(client, { schema }) as unknown as typeof db;
    const selection = (id: number) => draftRosterSelectionSchema.parse({
      round: 1, originalText: `Fixture ${id}`, confirmedName: `Fixture ${id}`, nhlPlayerId: id,
      assetType: "skater", position: "F", reviewNote: null,
    });
    await fixture.insert(draftRostersTable).values([
      { id: "alice", name: "ALICE", selections: [selection(1001)] },
      { id: "bob", name: "BOB", selections: [selection(1002)] },
    ]);
    const mapping = participantEmailMap('{"alice":"alice@example.test","bob":"bob@example.test"}', ["alice", "bob"]);
    const app = express();
    app.use(express.json());
    let writes = 0;
    app.use("/api", createTransactionsRouter({
      loadRosters: () => fixture.select().from(draftRostersTable),
      sessionExpiry: () => undefined,
      readAccess: async req => {
        const userId = req.get("Test-Account") ?? null;
        return resolveParticipantAccount(userId, {
          emailAddresses: [{ emailAddress: `${userId === "impostor" ? "alice" : userId}@example.test`,
            verification: { status: userId === "unverified" ? "unverified" : "verified" } }],
        }, mapping, "admin@example.test", fixture, "development");
      },
      recordSwap: async (ownerId, outgoingId, incomingId, requestId, createdBy = "fixture", confirmation) => {
        writes++;
        assert.equal(confirmation?.acknowledged, true);
        return fixture.transaction(async tx => {
          const prior = await tx.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.requestId, requestId));
          if (prior[0]) {
            if (prior[0].ownerId !== ownerId || prior[0].incomingPlayerId !== String(incomingId)) throw new TransactionError("Request ID already used for another swap");
            return prior[0];
          }
          const [saved] = await tx.insert(poolTransactionsTable).values({
            id: randomUUID(), ownerId, ownerName: ownerId.toUpperCase(), outgoingPlayerId: String(outgoingId),
            incomingPlayerId: String(incomingId), outgoingPlayerName: "Fixture outgoing", incomingPlayerName: "Fixture incoming",
            createdBy, requestId, transactionNumber: 1,
          }).returning();
          return saved!;
        });
      },
    }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api`;
    const submit = (body: unknown, account = "alice", key = "fixture-request-1") => fetch(`${url}/transactions`, {
      method: "POST", headers: { "Content-Type": "application/json", "Test-Account": account, "Idempotency-Key": key }, body: JSON.stringify(body),
    });
    const body = { ownerId: "alice", outgoingPlayerId: "1001", incomingPlayerId: "2001", acknowledged: true, eligibilityToken: "fixture-reviewed-token" };
    assert.equal((await submit(body, "")).status, 401);
    assert.equal((await submit({ ...body, ownerId: "bob" })).status, 403);
    assert.equal((await submit(body, "impostor")).status, 403);
    assert.equal((await submit(body, "unverified")).status, 403);
    assert.equal(writes, 0);
    assert.equal((await submit({ ...body, email: "bob@example.test" })).status, 400);
    assert.equal((await submit(body, "alice", "")).status, 400);
    assert.equal((await submit({ ...body, acknowledged: false })).status, 400);
    const access = GetTransactionAccessResponse.parse(await (await fetch(`${url}/transaction-access`, { headers: { "Test-Account": "alice" } })).json());
    assert.deepEqual(access.owners.map(p => p.ownerId), ["alice"]);
    assert.equal(JSON.stringify(access).includes("@"), false);
    const saved = await submit(body);
    assert.equal(saved.status, 201);
    const record = await saved.json();
    const replay = await submit(body);
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), record);
    assert.equal((await submit({ ...body, incomingPlayerId: "2002" })).status, 409);
    assert.equal((await fixture.select().from(poolTransactionsTable)).length, 1);
    assert.equal((await submit({ ...body, ownerId: "bob", outgoingPlayerId: "1002" }, "admin", "fixture-admin-request")).status, 201);
    assert.equal((await fixture.select().from(participantAccountLinksTable).where(eq(participantAccountLinksTable.ownerId, "alice")))[0]!.clerkUserId, "alice");
    const production = await resolveParticipantAccount("production-alice", {
      emailAddresses: [{ emailAddress: "alice@example.test", verification: { status: "verified" } }],
    }, mapping, undefined, fixture, "production");
    assert.equal(production.ownerId, "alice");
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
    client.release();
    assert.deepEqual(await db.select().from(poolTransactionsTable), originalLedger);
    const after = (await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, "cohen")))[0]!
      .selections.filter(p => p.droppedAt || p.acquiredAt);
    assert.deepEqual(after, originalCohen);
    await pool.end();
  }
});