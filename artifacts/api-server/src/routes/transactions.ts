import { Router, type IRouter, type Request } from "express";
import { desc } from "drizzle-orm";
import { db, poolTransactionsTable } from "@workspace/db";
import { GetTransactionsResponse, GetTransactionSummaryResponse, CreateTransactionBody, CreateTransactionResponse, UpdateTransactionPaymentBody, UpdateTransactionPaymentResponse } from "@workspace/api-zod";
import { loadDraftRosters } from "../lib/draft-roster-store";
import { transactionAccounting } from "../lib/transaction-accounting";
import { requireTransactionAccess } from "../middlewares/pool-participant";
import { readParticipantAccess } from "../middlewares/participant-access";
import { mayRecordForOwner } from "../lib/participant-identity";
import { getAuth } from "@clerk/express";
import { recordParticipantSwap } from "../scripts/record-participant-swap";
import { TransactionError } from "../lib/transaction-policy";
import { logger } from "../lib/logger";
import { requirePoolAdmin } from "../middlewares/pool-admin";
import { setTransactionPayment } from "../lib/transaction-payment";
import { previewSwap } from "../lib/transaction-preview";
import { participantAccounts } from "../lib/participant-accounts";

export function createTransactionsRouter(overrides: Partial<{
  loadRosters: typeof loadDraftRosters;
  readAccess: typeof readParticipantAccess;
  recordSwap: typeof recordParticipantSwap;
  sessionExpiry: (req: Request) => number | undefined;
}> = {}) {
const dependencies = { loadRosters: loadDraftRosters, readAccess: readParticipantAccess,
  recordSwap: recordParticipantSwap, sessionExpiry: (req: Request) => getAuth(req).sessionClaims?.exp, ...overrides };
const router: IRouter = Router();

router.get("/transactions", async (req, res, next): Promise<void> => {
  try {
    res.setHeader("Cache-Control", "private, no-store"); res.vary("Authorization"); res.vary("Cookie");
    const records = await db.select().from(poolTransactionsTable)
      .orderBy(desc(poolTransactionsTable.createdAt), desc(poolTransactionsTable.id));
    const parsed = GetTransactionsResponse.parse(records.map(row => ({ ...row,
      paid: row.paid,
      createdBy: row.details?.performedBy ?? (row.createdBy === "workspace-admin" ? "administrator" : "participant"),
      details: row.details ? Object.fromEntries(Object.entries(row.details).filter(([key]) =>
        ["outgoing", "incoming", "confirmationTimestamp", "fee", "eligibility", "pendingVerification", "performedBy", "incomingRound"].includes(key))) : null,
    })));
    // Preserve the database's real instant on the wire, not the viewer's local clock.
    res.json(parsed.map(row => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      effectiveAt: row.effectiveAt.toISOString(),
      reversedAt: row.reversedAt?.toISOString() ?? null,
    })));
  } catch (error) { next(error); }
});

router.get("/transaction-summary", async (req, res, next): Promise<void> => {
  try {
    res.setHeader("Cache-Control", "private, no-store"); res.vary("Authorization"); res.vary("Cookie");
    const [rosters, completed] = await Promise.all([
      dependencies.loadRosters(),
      db.select({ ownerId: poolTransactionsTable.ownerId, paid: poolTransactionsTable.paid, reversedAt: poolTransactionsTable.reversedAt }).from(poolTransactionsTable),
    ]);
    const access = await dependencies.readAccess(req, rosters.map(o => o.id));
    const accounting = transactionAccounting(rosters, completed, await participantAccounts());
    res.json(GetTransactionSummaryResponse.parse({
      ...accounting,
      participants: accounting.participants.map(p => ({
        ...p, amountOwing: access.admin || access.ownerId === p.ownerId ? p.amountOwing : null,
      })),
      recordingEnabled: access.admin || access.ownerId !== null,
      recordingReason: access.admin || access.ownerId !== null ? null : "Sign in with your verified assigned email to manage your own skater transactions.",
    }));
  } catch (error) { next(error); }
});
router.get("/transaction-access", async (req, res, next): Promise<void> => {
  res.set("Cache-Control", "private, no-store"); res.vary("Authorization"); res.vary("Cookie");
  try {
    const rosters = await dependencies.loadRosters();
    const access = await dependencies.readAccess(req, rosters.map(o => o.id));
    res.json({
      authenticated: access.authenticated, admin: access.admin, ownerId: access.ownerId,
      owners: rosters.filter(o => mayRecordForOwner(access, o.id)).map(o => ({
        ownerId: o.id, ownerName: o.name,
        skaters: o.selections.filter(p => p.assetType === "skater" && p.position !== "G" && !p.droppedAt && !p.voidedAt && p.nhlPlayerId)
          .map(p => ({ playerId: String(p.nhlPlayerId), name: p.confirmedName ?? p.originalText })),
      })),
      reason: !access.authenticated ? "Sign in to record a skater swap." :
        !access.admin && !access.ownerId ? "This account is not linked to a participant roster. Verify your assigned email or ask the owner to check the link." : null,
    });
  } catch (error) { next(error); }
});

router.post("/transactions/preview", requireTransactionAccess, async (req, res, next): Promise<void> => {
  const body = CreateTransactionBody.strict().safeParse(req.body);
  if (!body.success || !/^[1-9]\d*$/.test(body.data.outgoingPlayerId) || !/^[1-9]\d*$/.test(body.data.incomingPlayerId)) {
    res.status(400).json({ error: "Select an owned skater and an undrafted replacement." }); return;
  }
  try { res.json(await previewSwap(body.data.ownerId, Number(body.data.outgoingPlayerId), Number(body.data.incomingPlayerId))); }
  catch (error) {
    if (error instanceof TransactionError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
});

router.patch('/admin/transactions/:id/payment', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store'); next();
}, requirePoolAdmin, async (req, res, next): Promise<void> => {
  const body = UpdateTransactionPaymentBody.strict().safeParse(req.body);
  const id = req.params.id;
  if (!body.success || typeof id !== 'string' || !id.length || id.length > 100) {
    res.status(400).json({ error: 'Provide a transaction ID and a boolean paid status.' }); return;
  }
  try {
    const record = await db.transaction(tx => setTransactionPayment(tx, id, body.data.paid, getAuth(req).userId!));
    res.json(UpdateTransactionPaymentResponse.parse({ ...record, reversedAt: null }));
  } catch (error) {
    if (error instanceof TransactionError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
});

// Participants can act only for their verified linked roster; administrators
// retain all-roster access. Every permitted write uses the same atomic workflow.
router.post("/transactions", async (req, res, next): Promise<void> => {
  let access;
  try {
    const rosters = await dependencies.loadRosters();
    access = await dependencies.readAccess(req, rosters.map(o => o.id));
  } catch (error) { next(error); return; }
  if (!access.authenticated) { res.status(401).json({ error: "Sign in to record a skater swap." }); return; }
  const body = CreateTransactionBody.strict().safeParse(req.body);
  const key = req.get("Idempotency-Key");
  if (!body.success || !key || !/^[a-zA-Z0-9_-]{8,100}$/.test(key) ||
      body.data.acknowledged !== true || !body.data.eligibilityToken ||
      !/^[1-9]\d*$/.test(body.data.outgoingPlayerId) || !/^[1-9]\d*$/.test(body.data.incomingPlayerId)) {
    res.status(400).json({ error: "Provide a participant, two NHL skater IDs, and an Idempotency-Key of 8–100 letters, numbers, underscores or hyphens." }); return;
  }
  if (!mayRecordForOwner(access, body.data.ownerId)) {
    res.status(403).json({ error: "You can only change your securely linked participant roster." }); return;
  }
  const userId = access.userId!;
  try {
    const record = await dependencies.recordSwap(body.data.ownerId, Number(body.data.outgoingPlayerId),
      Number(body.data.incomingPlayerId), `${userId}:${key}`, userId, {
        acknowledged: body.data.acknowledged, eligibilityToken: body.data.eligibilityToken,
        admin: access.admin, expiresAt: dependencies.sessionExpiry(req),
      });
    const row = CreateTransactionResponse.parse(record);
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), effectiveAt: row.effectiveAt.toISOString() });
  } catch (error) {
    logger.error({ err: error }, "Transaction recording failed");
    res.status(error instanceof TransactionError ? error.status : 503).json({
      error: error instanceof TransactionError ? error.message :
        "Recording could not be confirmed. Retry with the same request key to safely check the saved transaction.",
    });
  }
});

return router;
}
export default createTransactionsRouter();