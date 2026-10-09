/**
 * Shared atomic skater-swap workflow for the verified-admin API and trusted
 * workspace command. Participant self-service requires secure account links.
 * Usage: ... record-participant-swap.ts OWNER OUTGOING_ID INCOMING_ID REQUEST_ID
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, draftRosterSelectionSchema, draftRostersTable, poolTransactionsTable, scoringRulesTable, participantAccountsTable, type PoolTransaction } from "@workspace/db";
import { loadDraftRosters } from "../lib/draft-roster-store";
import { availablePlayersService } from "../lib/available-players-service";
import { nhlSourceService } from "../lib/nhl-source-service";
import { postgresNhlPoolScoringArchiveStore } from "../lib/nhl-source-store";
import { loadPersistedScoringRules, POOL_SCORING_RULES_ID } from "../lib/scoring-rules-store";
import { poolScoringService, rowsForRosters, type PoolScoringArchive } from "../lib/pool-scoring-service";
import { ownershipPoolDate, scoreValues, type OwnershipScore } from "../lib/ownership-scoring";
import { NHL_TEAM_NAMES } from "../data/draft-roster-identities";
import { requireSkaterDrop, requireSkaterPickup, requireRosterComposition, TransactionError } from "../lib/transaction-policy";
import { MAX_DROPS } from "../lib/transaction-accounting";
import { initializeParticipantAccounts } from "../lib/participant-accounts";
import { eligibilityPlan, recheckEligibility } from "../lib/pickup-eligibility";

export async function recordParticipantSwap(
  ownerId: string, outgoingId: number, incomingId: number, requestId: string,
  createdBy = "workspace-admin",
  confirmation?: { acknowledged: boolean; eligibilityToken: string; admin?: boolean; expiresAt?: number },
) {
  if (!ownerId || !requestId || !Number.isSafeInteger(outgoingId) ||
      !Number.isSafeInteger(incomingId) || outgoingId <= 0 || incomingId <= 0 ||
      outgoingId === incomingId || requestId.length > 200) throw new TransactionError("Invalid swap identity", 400);
  const prior = await db.select().from(poolTransactionsTable)
    .where(eq(poolTransactionsTable.requestId, requestId));
  if (prior.length) {
    if (prior[0]!.reversedAt) throw new TransactionError("This move was saved and later reversed by the administrator. Refresh the roster before proposing another move.");
    if (prior[0]!.ownerId !== ownerId || prior[0]!.outgoingPlayerId !== String(outgoingId) ||
        prior[0]!.incomingPlayerId !== String(incomingId) ||
        prior[0]!.createdBy !== createdBy) throw new TransactionError("Request ID already used for another swap");
    const saved = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, ownerId));
    const selections = saved[0]?.selections ?? [];
    if (selections.some(row => row.nhlPlayerId === outgoingId && row.droppedAt) &&
        selections.some(row => row.nhlPlayerId === incomingId && row.acquiredAt)) return prior[0]!;
    if (createdBy !== "workspace-admin") throw new TransactionError("Saved ownership metadata requires administrator recovery.", 503);
    return repairExistingSwapMetadata(prior[0]!);
  }
  const [rosters, available, source, stored, configuration] = await Promise.all([
    loadDraftRosters(), availablePlayersService.getSnapshot(), nhlSourceService.getSnapshot(),
    postgresNhlPoolScoringArchiveStore.read(), loadPersistedScoringRules(),
  ]);
  const owner = rosters.find(row => row.id === ownerId);
  if (!owner) throw new TransactionError("Participant not found", 404);
  const outgoing = requireSkaterDrop(owner.selections, outgoingId);
  requireRosterComposition(owner.selections);
  const incoming = available.rows.find(row => row.nhlPlayerId === incomingId);
  if (incoming) requireSkaterPickup(incoming.position);
  if (!incoming) throw new TransactionError("Pickup is no longer available. Refresh Undrafted Players.");
  if (outgoing.position !== (incoming.position === "D" ? "D" : "F")) throw new TransactionError("The replacement must belong to the same position group.", 400);
  await initializeParticipantAccounts();
  const preparedEligibility = await eligibilityPlan(incoming.team);
  if (source.status !== "available") throw new TransactionError("Fresh official NHL data is required to capture the scoring cutoff.", 503);
  if (!configuration.rules || !stored?.snapshot) throw new Error("Verified archive and scoring rules are required");
  const full = await poolScoringService.getSnapshot(source);
  if (full.asOf !== (stored.lastSuccessAt ?? null)) {
    throw new TransactionError("NHL scoring changed while preparing the swap. Retry with the same request key.");
  }
  const frozen = full.rows.find(row => row.ownerId === ownerId && row.round === outgoing.round &&
    row.nhlPlayerId === outgoingId);
  if (!frozen || frozen.poolPoints === null) throw new Error("Outgoing contribution must be verified before freezing");
  const archive = stored.snapshot as PoolScoringArchive;
  if (!archive.gameFacts || archive.season !== 20262027) throw new Error("Unsupported scoring archive");
  const completedGames = Object.values(archive.gameFacts).filter(game => game.final).map(game => game.gameId);
  const liveGames = Object.values(archive.gameFacts).filter(game => !game.final);
  if (liveGames.some(game => !game.verified &&
       game.players[String(outgoingId)])) {
    throw new Error("An active game lacks verified event facts; cannot freeze an exact contribution");
  }
  const candidate = draftRosterSelectionSchema.parse({
    round: Math.max(...owner.selections.map(row => row.round)) + 1,
    originalText: incoming.name, confirmedName: incoming.name, confirmedTeam: NHL_TEAM_NAMES[incoming.team] ?? incoming.team,
    confirmedLastName: incoming.name.split(" ").at(-1), nhlPlayerId: incomingId,
    assetType: "skater", position: incoming.position === "D" ? "D" : "F", reviewNote: null,
    identityCheckedAt: available.lastCatalogRefreshAt ?? full.asOf ?? new Date().toISOString(),
    identitySource: "Official NHL catalog; recorded skater transaction",
  });
  const now = new Date().toISOString();
  const dropDay = ownershipPoolDate(now);
  const dayArchive = { ...archive, gameFacts: Object.fromEntries(
    Object.values(archive.gameFacts).filter(game => game.gameDate === dropDay)
      .map(game => [String(game.gameId), game])) };
  const dayRow = rowsForRosters([{ ...owner, selections: [{
    ...outgoing, scoringBaseline: outgoing.ownershipDailyBaselines?.[dropDay],
  }] }], dayArchive, configuration.rules, true)[0];
  if (!dayRow || dayRow.poolPoints === null) throw new TransactionError("The outgoing skater's daily contribution must be verified.", 503);
  const frozenDaily: OwnershipScore = {
    goals: dayRow?.goals ?? 0, assists: dayRow?.assists ?? 0,
    powerPlayGoals: dayRow?.powerPlayGoals ?? 0, shortHandedGoals: dayRow?.shortHandedGoals ?? 0,
    overtimeGoals: dayRow.overtimeGoals ?? 0, poolPoints: dayRow.poolPoints,
    gamesPlayed: dayRow.gamesPlayed ?? 0, wins: null, shutouts: null,
  };
  return db.transaction(async tx => {
    // Lock every participant in a stable order: two users cannot acquire the same
    // currently-free player concurrently in this JSON-backed ownership model.
    const locked = await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id).for("update");
    const [lockedConfiguration] = await tx.select({ revision: scoringRulesTable.revision })
      .from(scoringRulesTable).where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID)).for("update");
    if (!lockedConfiguration || lockedConfiguration.revision !== configuration.revision) {
      throw new TransactionError("Scoring rules changed while preparing the swap. Retry with the same request key.");
    }
    const existing = await tx.select().from(poolTransactionsTable)
      .where(eq(poolTransactionsTable.requestId, requestId));
    if (existing.length) {
      if (existing[0]!.reversedAt) throw new TransactionError("This move was reversed by the administrator. Refresh the roster.");
      if (existing[0]!.ownerId !== ownerId || existing[0]!.outgoingPlayerId !== String(outgoingId) ||
          existing[0]!.incomingPlayerId !== String(incomingId) ||
          existing[0]!.createdBy !== createdBy) throw new TransactionError("Request ID already used for another swap");
      return existing[0]!;
    }
    const trades = await tx.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.ownerId, ownerId));
    const [account] = await tx.select().from(participantAccountsTable).where(eq(participantAccountsTable.ownerId, ownerId)).for("update");
    const used = Math.max(0, trades.filter(t => !t.reversedAt).length + (account?.countAdjustment ?? 0));
    if (used >= (account?.transactionLimit ?? MAX_DROPS)) throw new TransactionError("No drops remaining");
    const current = locked.find(row => row.id === ownerId);
    if (!current) throw new Error("Participant no longer exists");
    const selections = draftRosterSelectionSchema.array().parse(current.selections);
    requireRosterComposition(selections);
    requireSkaterDrop(selections, outgoingId);
    const index = selections.findIndex(row => row.nhlPlayerId === outgoingId && !row.droppedAt);
    if (index < 0 || selections[index]!.round !== outgoing.round) throw new TransactionError("Roster changed during confirmation");
    if (locked.some(row => row.selections.some(selection => !selection.droppedAt &&
        selection.nhlPlayerId === incomingId))) {
      throw new TransactionError("Pickup was acquired by another participant");
    }
    const committedAt = new Date().toISOString();
    if (confirmation?.expiresAt && Date.parse(committedAt) >= confirmation.expiresAt * 1000) {
      throw new TransactionError("Your session expired. Sign in again.", 401);
    }
    if (confirmation && !confirmation.admin && (account?.disabled || account?.clerkUserId !== createdBy)) {
      throw new TransactionError("Your roster authorization changed. Sign in again or contact the administrator.", 403);
    }
    const eligibility = recheckEligibility(preparedEligibility, new Date(committedAt));
    if (confirmation && (!confirmation.acknowledged || confirmation.eligibilityToken !== eligibility.eligibilityToken)) {
      throw new TransactionError("Game eligibility changed or was not acknowledged. Review the updated deadline and acknowledge it again.", 409);
    }
    const missed = eligibility.games.filter(g => g.eligible === false);
    const excluded = [...new Set([...completedGames, ...missed.map(g => g.gameId)])];
    if (ownershipPoolDate(committedAt) !== dropDay) throw new TransactionError("The scoring day changed during recording. Retry with the same request key.");
    selections[index] = { ...selections[index]!, droppedAt: committedAt, frozenScoring: scoreValues(frozen),
      frozenDailyScoring: { [dropDay]: frozenDaily } };
    selections.push({ ...candidate, round: Math.max(...selections.map(row => row.round)) + 1,
      acquiredAt: committedAt, eligibilityPolicy: "scheduled-minus-one-minute",
      eligibilityPending: eligibility.pendingVerification,
      eligibilityGames: eligibility.games,
      ...(missed.length ? { eligibleAfterGameDate: missed.map(g => g.gameDate).sort().at(-1)! } : {}),
      scoringExcludedGameIds: excluded });
    requireRosterComposition(selections);
    await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, ownerId));
    const [record] = await tx.insert(poolTransactionsTable).values({
      id: randomUUID(), ownerId, ownerName: current.name,
      outgoingPlayerId: String(outgoingId), outgoingPlayerName: outgoing.confirmedName ?? outgoing.originalText,
      incomingPlayerId: String(incomingId), incomingPlayerName: incoming.name,
      createdBy, requestId, createdAt: new Date(committedAt), effectiveAt: new Date(committedAt),
      transactionNumber: used + 1,
      details: { outgoing: { name: outgoing.confirmedName ?? outgoing.originalText, position: outgoing.position, team: outgoing.confirmedTeam },
        incoming: { name: incoming.name, position: incoming.position, team: incoming.team, seasonPoolPoints: incoming.poolPoints },
        outgoingSelection: outgoing, incomingRound: selections.at(-1)!.round,
        confirmationTimestamp: committedAt, fee: 50, eligibility: eligibility.games,
        pendingVerification: eligibility.pendingVerification, performedBy: confirmation?.admin || createdBy === "workspace-admin" ? "administrator" : "participant" },
    }).returning();
    // Saving itself can span the deadline. Recheck after the writes, not just
    // before them; a changed decision rolls the entire operation back.
    const confirmedAt = new Date().toISOString();
    if (recheckEligibility(preparedEligibility, new Date(confirmedAt)).eligibilityToken !== eligibility.eligibilityToken ||
        (confirmation?.expiresAt && Date.parse(confirmedAt) >= confirmation.expiresAt * 1000)) {
      throw new TransactionError("The eligibility deadline or your session changed while saving. Review the current eligibility and acknowledge it again.", 409);
    }
    selections[index]!.droppedAt = confirmedAt;
    selections.at(-1)!.acquiredAt = confirmedAt;
    await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, ownerId));
    const [saved] = await tx.update(poolTransactionsTable).set({ createdAt: new Date(confirmedAt), effectiveAt: new Date(confirmedAt),
      details: { ...record!.details, confirmationTimestamp: confirmedAt } }).where(eq(poolTransactionsTable.id, record!.id)).returning();
    if (recheckEligibility(preparedEligibility, new Date()).eligibilityToken !== eligibility.eligibilityToken ||
        (confirmation?.expiresAt && Date.now() >= confirmation.expiresAt * 1000))
      throw new TransactionError("The deadline passed during saving. Nothing was changed. Review and acknowledge the excluded game.", 409);
    return saved!;
  });
}

/**
 * Recovery for an older running JSON-schema writer stripping newly introduced
 * metadata. Never invent a historical baseline: only recover when the verified
 * archive proves there were no games on/after the original transaction day.
 */
async function repairExistingSwapMetadata(record: PoolTransaction) {
  const [rosters, stored, source] = await Promise.all([
    loadDraftRosters(), postgresNhlPoolScoringArchiveStore.read(), nhlSourceService.getSnapshot(),
  ]);
  const archive = stored?.snapshot as PoolScoringArchive | undefined;
  const instant = record.effectiveAt.toISOString();
  const date = ownershipPoolDate(instant);
  if (!archive?.gameFacts || Object.values(archive.gameFacts).some(game => game.gameDate >= date)) {
    throw new Error("Original scoring snapshots are required; historical cutoff cannot be reconstructed safely");
  }
  const snapshot = await poolScoringService.getSnapshot(source);
  const outgoingId = Number(record.outgoingPlayerId), incomingId = Number(record.incomingPlayerId);
  const owner = rosters.find(row => row.id === record.ownerId);
    const dropped = owner?.selections.find(row => row.nhlPlayerId === outgoingId && row.droppedAt === instant) ??
      owner?.selections.find(row => row.nhlPlayerId === outgoingId && !row.droppedAt);
    const acquired = owner?.selections.find(row => row.nhlPlayerId === incomingId && row.acquiredAt === instant) ??
      owner?.selections.find(row => row.nhlPlayerId === incomingId && !row.droppedAt);
  const frozen = snapshot.rows.find(row => row.ownerId === record.ownerId && row.nhlPlayerId === outgoingId);
  if (!owner || !dropped || !acquired || !frozen || frozen.poolPoints === null) {
    throw new Error("Original swap roster or verified outgoing contribution unavailable");
  }
  const zero: OwnershipScore = { goals: 0, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0,
    overtimeGoals: 0, poolPoints: 0, gamesPlayed: 0, wins: null, shutouts: null };
  const exclusions = Object.values(archive.gameFacts).filter(game => game.final).map(game => game.gameId);
  await db.transaction(async tx => {
    const rows = await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id).for("update");
    const current = rows.find(row => row.id === record.ownerId);
    if (!current) throw new Error("Roster no longer exists");
    const selections = draftRosterSelectionSchema.array().parse(current.selections);
    const outgoing = selections.find(row => row.round === dropped.round);
    const incoming = selections.find(row => row.round === acquired.round);
    if (!outgoing || !incoming) throw new Error("Swap selections no longer exist");
    Object.assign(outgoing, { droppedAt: instant, frozenScoring: scoreValues(frozen),
      frozenDailyScoring: { [date]: zero } });
    Object.assign(incoming, { acquiredAt: instant, scoringBaseline: zero,
      scoringExcludedGameIds: exclusions, ownershipDailyBaselines: {} });
    await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, current.id));
  });
  return record;
}

if (process.argv[1]?.endsWith("record-participant-swap.ts")) {
  const [owner, outgoing, incoming, request] = process.argv.slice(2);
  recordParticipantSwap(owner ?? "", Number(outgoing), Number(incoming), request ?? "")
    .then(record => console.log(JSON.stringify({ id: record.id, owner: record.ownerName,
      dropped: record.outgoingPlayerName, pickedUp: record.incomingPlayerName, recordedAt: record.createdAt })))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}