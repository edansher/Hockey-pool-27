import { db, poolTransactionsTable } from "@workspace/db";
import { loadDraftRosters } from "./draft-roster-store";
import { availablePlayersService } from "./available-players-service";
import { participantAccounts } from "./participant-accounts";
import { transactionAccounting } from "./transaction-accounting";
import { eligibilityPlan, recheckEligibility } from "./pickup-eligibility";
import { requireRosterComposition, requireSkaterDrop, requireSkaterPickup, TransactionError } from "./transaction-policy";

export async function previewSwap(ownerId: string, outgoingId: number, incomingId: number) {
  const [rosters, available, accounts, completed] = await Promise.all([
    loadDraftRosters(), availablePlayersService.getSnapshot(), participantAccounts(),
    db.select().from(poolTransactionsTable),
  ]);
  const owner = rosters.find(o => o.id === ownerId);
  if (!owner) throw new TransactionError("Participant not found", 404);
  requireRosterComposition(owner.selections);
  const outgoing = requireSkaterDrop(owner.selections, outgoingId);
  const incoming = available.rows.find(p => p.nhlPlayerId === incomingId);
  if (!incoming) throw new TransactionError("Replacement is no longer available. Refresh Undrafted Players and choose another player.");
  requireSkaterPickup(incoming.position);
  if (outgoing.position !== (incoming.position === "D" ? "D" : "F")) throw new TransactionError("Replace a forward with a forward, or a defenceman with a defenceman.", 400);
  const allowance = transactionAccounting(rosters, completed, accounts).participants.find(p => p.ownerId === ownerId)!;
  if (allowance.dropsLeft === 0) throw new TransactionError("No transactions remaining for this season.");
  const prepared = await eligibilityPlan(incoming.team);
  const serverNow = new Date();
  const plan = recheckEligibility(prepared, serverNow);
  return { ownerId, outgoing: { nhlPlayerId: outgoingId, name: outgoing.confirmedName ?? outgoing.originalText,
      position: outgoing.position, team: outgoing.confirmedTeam }, incoming,
    fee: 50, dropsUsedAfter: allowance.dropsUsed + 1, dropsLeftAfter: allowance.dropsLeft - 1,
    serverTime: serverNow.toISOString(), ...plan };
}