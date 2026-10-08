import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, participantAccountsTable, poolAuditTable, poolTransactionsTable,
  draftRostersTable, draftRosterSelectionSchema, scoringRulesTable } from "@workspace/db";
import { ManagePoolBody } from "@workspace/api-zod";
import { participantAccounts } from "./participant-accounts";
import { loadDraftRosters } from "./draft-roster-store";
import { availablePlayersService } from "./available-players-service";
import { poolScoringService, teamAbbreviation, rowsForRosters, type PoolScoringArchive } from "./pool-scoring-service";
import { addConfirmedGoalies } from "./draft-roster-identity";
import { loadPersistedScoringRules, POOL_SCORING_RULES_ID } from "./scoring-rules-store";
import { nhlSourceService } from "./nhl-source-service";
import { postgresNhlPoolScoringArchiveStore } from "./nhl-source-store";
import { eligibilityPlan, recheckEligibility } from "./pickup-eligibility";
import { scoreValues, ownershipPoolDate } from "./ownership-scoring";
import { TransactionError } from "./transaction-policy";
import { NHL_TEAM_NAMES } from "../data/draft-roster-identities";
import { recordAudit } from "./pool-audit";

export async function adminManagementSnapshot() {
  const [accounts, rosters, transactions, audit] = await Promise.all([
    participantAccounts(), loadDraftRosters(),
    db.select().from(poolTransactionsTable).orderBy(desc(poolTransactionsTable.effectiveAt)),
    db.select().from(poolAuditTable).orderBy(desc(poolAuditTable.createdAt)).limit(250),
  ]);
  return { accounts, rosters, transactions, audit };
}
function integer(value: unknown, label: string, min = 0, max = 9999999999) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new TransactionError(`Invalid ${label}.`, 400);
  return value;
}
export async function managePool(body: unknown, actor: string) {
  const parsed = ManagePoolBody.strict().safeParse(body);
  if (!parsed.success) throw new TransactionError("Select an administrator operation, give a reason and use a unique request ID.", 400);
  const input = parsed.data;
  const d = input.details;
  const requestId = `${actor}:${input.requestId}`;
  await participantAccounts();
  // Prepare official identity/scoring outside row locks. All ownership decisions
  // are repeated against the locked rows; no caller can supply points or credits.
  const catalog = input.action === "roster" && d.operation !== "remove" && !d.goalieTeam
    ? await availablePlayersService.getSnapshot() : null;
  const scoring = input.action === "roster" && d.operation === "remove"
    ? await poolScoringService.getSnapshot(await nhlSourceService.getSnapshot()) : null;
  const removalContext = scoring ? {
    rosters: await loadDraftRosters(),
    archive: await postgresNhlPoolScoringArchiveStore.read(),
    configuration: await loadPersistedScoringRules(),
  } : null;
  const candidate = catalog?.rows.find(p => p.nhlPlayerId === d.nhlPlayerId);
  let plan = input.action === "roster" && d.operation === "add" && candidate
    ? await eligibilityPlan(candidate.team) : null;
  const archiveRecord = input.action === "eligibility" ? await postgresNhlPoolScoringArchiveStore.read() : null;
  let adminGoalies: Array<{ nhlPlayerId: number; confirmedName: string; confirmedTeam: string; identitySource: string }> | undefined;
  if (input.action === "roster" && d.goalieTeam) {
    if (typeof d.goalieTeam !== "string" || !NHL_TEAM_NAMES[d.goalieTeam]) throw new TransactionError("Choose an official NHL goalie team.", 400);
    const url = `https://api-web.nhle.com/v1/roster/${d.goalieTeam}/20262027`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new TransactionError("Official goalie identities cannot be verified.", 503);
    const roster = await response.json() as { goalies?: any[] };
    if (!Array.isArray(roster.goalies) || !roster.goalies.length) throw new TransactionError("Official goalie identities are unavailable.", 503);
    adminGoalies = roster.goalies.map(g => {
      if (!Number.isSafeInteger(g.id) || !g.firstName?.default || !g.lastName?.default) throw new TransactionError("Official goalie identity is incomplete.", 503);
      return { nhlPlayerId: g.id, confirmedName: `${g.firstName.default} ${g.lastName.default}`,
        confirmedTeam: NHL_TEAM_NAMES[String(d.goalieTeam)]!, identitySource: url };
    });
    if (d.operation === "add") plan = await eligibilityPlan(String(d.goalieTeam));
  }
  let sendInvitation = false;

  const result = await db.transaction(async tx => {
    const rosters = await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id).for("update");
    const [prior] = await tx.select().from(poolAuditTable).where(eq(poolAuditTable.requestId, requestId));
    if (prior) {
      if (prior.actor !== actor || prior.action !== input.action || prior.reason !== input.reason ||
          JSON.stringify(prior.details.input) !== JSON.stringify(d)) throw new TransactionError("Request ID was already used for another correction.");
      if (input.action === "invitation" && prior.details.status !== "sent")
        throw new TransactionError(prior.details.status === "pending" ? "Invitation delivery is already being processed; check its audit status."
          : "That invitation attempt failed. Use a new reviewed request to retry.", 409);
      return prior;
    }
    const owner = rosters.find(o => o.id === d.ownerId);
    let changes: Record<string, unknown> = {};
    if (input.action === "reverse") {
      if (typeof d.id !== "string") throw new TransactionError("Select a transaction.", 400);
      const [record] = await tx.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.id, d.id)).for("update");
      if (!record) throw new TransactionError("Transaction not found.", 404);
      if (record.reversedAt) throw new TransactionError("This transaction was already reversed.");
      const roster = rosters.find(o => o.id === record.ownerId)!;
      const selections = draftRosterSelectionSchema.array().parse(roster.selections);
      const when = record.effectiveAt.toISOString();
      const dropped = selections.find(s => s.nhlPlayerId === Number(record.outgoingPlayerId) && s.droppedAt === when);
      const acquired = selections.find(s => s.nhlPlayerId === Number(record.incomingPlayerId) && s.acquiredAt === when && !s.droppedAt);
      if (!dropped || !acquired) throw new TransactionError("A later roster change depends on this move. Reverse dependent moves first; nothing was changed.");
      if (rosters.some(r => r.selections.some(s => !s.droppedAt && s.nhlPlayerId === Number(record.outgoingPlayerId))))
        throw new TransactionError("The original player is owned again. Resolve that ownership before reversing this move.");
      const savedOriginal = record.details?.outgoingSelection;
      const restored = { ...(savedOriginal ? draftRosterSelectionSchema.parse(savedOriginal) : {}), ...dropped };
      delete restored.droppedAt; delete restored.frozenScoring; delete restored.frozenDailyScoring;
      const now = new Date();
      const before = roster.selections;
      selections[selections.indexOf(dropped)] = restored;
      selections[selections.indexOf(acquired)] = { ...acquired, droppedAt: now.toISOString(), voidedAt: now.toISOString(),
        frozenScoring: { goals: 0, assists: 0, powerPlayGoals: 0, shortHandedGoals: 0, overtimeGoals: 0, poolPoints: 0, gamesPlayed: 0, wins: null, shutouts: null } };
      await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, roster.id));
      await tx.update(poolTransactionsTable).set({ reversedAt: now, reversedBy: actor }).where(eq(poolTransactionsTable.id, record.id));
      changes = { transactionId: record.id, before, after: selections, feeVoided: 50, priorPaid: record.paid };
    } else {
      if (!owner) throw new TransactionError("Participant not found.", 404);
      const [account] = await tx.select().from(participantAccountsTable).where(eq(participantAccountsTable.ownerId, owner.id)).for("update");
      if (!account) throw new TransactionError("Participant account is missing.", 409);
      if (input.action === "account") {
        if (d.email !== null && (typeof d.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))) throw new TransactionError("Provide a valid assigned email or clear it.", 400);
        if (typeof d.disabled !== "boolean") throw new TransactionError("Specify whether the participant is enabled.", 400);
        const email = typeof d.email === "string" ? d.email.trim().toLowerCase() : null;
        const duplicate = email ? await tx.select().from(participantAccountsTable).where(eq(participantAccountsTable.email, email)) : [];
        if (duplicate.some(a => a.ownerId !== owner.id)) throw new TransactionError("That email is assigned to a different roster. No changes saved.");
        const after = { email, disabled: d.disabled, clerkUserId: email === account.email ? account.clerkUserId : null };
        await tx.update(participantAccountsTable).set(after).where(eq(participantAccountsTable.ownerId, owner.id));
        if (email !== account.email) {
          const { participantAccountLinksTable } = await import("@workspace/db");
          await tx.delete(participantAccountLinksTable).where(eq(participantAccountLinksTable.ownerId, owner.id));
        }
        changes = { before: account, after: { ...account, ...after } };
      } else if (input.action === "allowance") {
        const transactionLimit = integer(d.transactionLimit, "season limit", 0, 99);
        const countAdjustment = integer(d.countAdjustment, "allowance adjustment", -99, 99);
        await tx.update(participantAccountsTable).set({ transactionLimit, countAdjustment }).where(eq(participantAccountsTable.ownerId, owner.id));
        changes = { before: account, after: { ...account, transactionLimit, countAdjustment }, feesUnchanged: true };
      } else if (input.action === "invitation") {
        if (!account.email || account.disabled) throw new TransactionError("Assign and enable this participant's email before sending an invitation.", 400);
        changes = { email: account.email, status: "pending" };
        sendInvitation = true;
      } else if (input.action === "roster") {
        const selections = draftRosterSelectionSchema.array().parse(owner.selections);
        const before = owner.selections;
        const now = new Date().toISOString();
        const selection = d.operation === "add" ? null : selections.find(s => s.round === d.round && !s.droppedAt);
        if (d.operation !== "add" && !selection) throw new TransactionError("Select an active roster round. Refresh the roster.");
        if (d.operation === "remove") {
          const [lockedRules] = await tx.select().from(scoringRulesTable).where(eq(scoringRulesTable.id, POOL_SCORING_RULES_ID)).for("update");
          if (!removalContext?.archive?.snapshot || !removalContext.configuration.rules ||
              lockedRules?.revision !== removalContext.configuration.revision ||
              scoring!.asOf !== removalContext.archive.lastSuccessAt)
            throw new TransactionError("Scoring changed while preparing this removal. Refresh and review it again.");
          const day = ownershipPoolDate(now);
          const archive = removalContext.archive.snapshot as PoolScoringArchive;
          const dayArchive = { ...archive, gameFacts: Object.fromEntries(Object.entries(archive.gameFacts).filter(([, g]) => g.gameDate === day)) };
          const dayRows = rowsForRosters(removalContext.rosters, dayArchive, removalContext.configuration.rules, true)
            .filter(r => r.ownerId === owner.id && r.round === selection!.round);
          if (selection!.assetType === "goalieTeam") {
            const known = addConfirmedGoalies(owner.id, [selection!])[0]!;
            const goalies = known.goalies ?? [];
            const earned = scoring!.rows.filter(r => r.ownerId === owner.id && r.round === selection!.round);
            if (!goalies.length || goalies.some(g => !earned.some(r => r.nhlPlayerId === g.nhlPlayerId && r.poolPoints !== null) ||
                !dayRows.some(r => r.nhlPlayerId === g.nhlPlayerId && r.poolPoints !== null)))
              throw new TransactionError("Verified individual goalie identities and earned points are required before removing this team.");
            selection!.adminGoalies = goalies.map(g => ({ nhlPlayerId: g.nhlPlayerId, confirmedName: g.confirmedName,
              confirmedTeam: g.confirmedTeam, identitySource: g.identitySource ?? "Administrator retained verified goalie identity" }));
            selection!.droppedAt = now;
            selection!.frozenGoalieScoring = Object.fromEntries(earned.map(r => [String(r.nhlPlayerId), scoreValues(r)]));
            selection!.frozenDailyGoalieScoring = { [day]: Object.fromEntries(dayRows.map(r => [String(r.nhlPlayerId), scoreValues(r)])) };
          } else {
            const row = scoring?.rows.find(r => r.ownerId === owner.id && r.round === selection!.round && r.nhlPlayerId === selection!.nhlPlayerId);
            const daily = dayRows.find(r => r.nhlPlayerId === selection!.nhlPlayerId);
            if (!row || row.poolPoints === null || !daily || daily.poolPoints === null) throw new TransactionError("Verified earned points are required before removing this player.");
            selection!.droppedAt = now; selection!.frozenScoring = scoreValues(row);
            selection!.frozenDailyScoring = { [day]: scoreValues(daily) };
          }
        } else if (d.operation === "add" || d.operation === "correct") {
          if (d.goalieTeam) {
            if (typeof d.goalieTeam !== "string" || !NHL_TEAM_NAMES[d.goalieTeam]) throw new TransactionError("Choose an official NHL goalie-team abbreviation.", 400);
            const team = NHL_TEAM_NAMES[d.goalieTeam]!;
            if (rosters.some(r => r.selections.some(s => !s.droppedAt && s.assetType === "goalieTeam" && teamAbbreviation(s.confirmedTeam) === d.goalieTeam && !(r.id === owner.id && s.round === selection?.round))))
              throw new TransactionError("That goalie team is already owned.");
            if (rosters.some(r => addConfirmedGoalies(r.id, r.selections).some(s => !s.droppedAt &&
                !(r.id === owner.id && s.round === selection?.round) &&
                s.goalies?.some(g => adminGoalies!.some(newGoalie => newGoalie.nhlPlayerId === g.nhlPlayerId)))))
              throw new TransactionError("An individual goalie in this team already belongs to another roster. Correct its existing assignment first.");
            const replacement = draftRosterSelectionSchema.parse({ ...(selection ?? {}), round: selection?.round ?? Math.max(...selections.map(s => s.round), 0) + 1,
              originalText: team, confirmedName: team, confirmedTeam: team, nhlPlayerId: null,
              position: "G", assetType: "goalieTeam", adminGoalies, reviewNote: null, identitySource: "Administrator goalie-team correction", identityCheckedAt: now,
              ...(d.operation === "add" ? { acquiredAt: now, eligibilityPolicy: "scheduled-minus-one-minute",
                eligibilityPending: plan!.pendingVerification, eligibilityGames: recheckEligibility(plan!, new Date(now)).games } : {}) });
            if (selection) selections[selections.indexOf(selection)] = replacement; else selections.push(replacement);
          } else {
            integer(d.nhlPlayerId, "NHL player ID", 1);
            if (!candidate) throw new TransactionError("Choose an available NHL skater from Undrafted Players.");
            if (candidate.position === "G") throw new TransactionError("Use the goalie-team correction control for goalies.", 400);
            if (rosters.some(r => r.selections.some(s => !s.droppedAt && s.nhlPlayerId === candidate.nhlPlayerId && !(r.id === owner.id && s.round === selection?.round))))
              throw new TransactionError("This player is already active on a roster.");
            const p = draftRosterSelectionSchema.parse({
              ...(selection ?? {}), round: selection?.round ?? Math.max(...selections.map(s => s.round), 0) + 1,
              originalText: candidate.name, confirmedName: candidate.name, confirmedTeam: NHL_TEAM_NAMES[candidate.team] ?? candidate.team,
              confirmedLastName: candidate.name.split(" ").at(-1), nhlPlayerId: candidate.nhlPlayerId,
              assetType: "skater", position: candidate.position === "D" ? "D" : "F",
              reviewNote: null, identitySource: "Administrator correction from official NHL catalog", identityCheckedAt: now,
              ...(d.operation === "add" ? { acquiredAt: now, eligibilityPolicy: "scheduled-minus-one-minute",
                eligibilityPending: plan!.pendingVerification, eligibilityGames: recheckEligibility(plan!, new Date(now)).games } : {}),
            });
            if (selection) selections[selections.indexOf(selection)] = p; else selections.push(p);
          }
        } else throw new TransactionError("Choose add, remove or correct.", 400);
        await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, owner.id));
        changes = { before, after: selections, participantFeeCreated: false };
      } else if (input.action === "eligibility") {
        const round = integer(d.round, "roster round", 1);
        const gameId = integer(d.gameId, "game ID", 1);
        if (typeof d.eligible !== "boolean") throw new TransactionError("Choose whether this game is eligible.", 400);
        const selections = draftRosterSelectionSchema.array().parse(owner.selections);
        const selection = selections.find(s => s.round === round);
        if (!selection || selection.assetType !== "skater") throw new TransactionError("Select the acquired skater's roster round.");
        const archive = archiveRecord?.snapshot as any;
        const game = archive?.scheduledGames?.[String(gameId)];
        if (!game || !game.startTimeUTC || (teamAbbreviation(selection.confirmedTeam) !== game.awayAbbrev && teamAbbreviation(selection.confirmedTeam) !== game.homeAbbrev))
          throw new TransactionError("The official game and scheduled time for this player's team must be verified.", 409);
        const before = { ...selection };
        selection.eligibilityPolicy = "scheduled-minus-one-minute";
        selection.eligibilityGames = [...(selection.eligibilityGames ?? []).filter(g => g.gameId !== gameId),
          { gameId, gameDate: game.gameDate, scheduledStart: game.startTimeUTC,
            cutoff: new Date(Date.parse(game.startTimeUTC) - 60000).toISOString(), eligible: d.eligible, overriddenByAdministrator: true }];
        selection.scoringExcludedGameIds = d.eligible ? (selection.scoringExcludedGameIds ?? []).filter(id => id !== gameId)
          : [...new Set([...(selection.scoringExcludedGameIds ?? []), gameId])];
        if (d.eligible && selection.eligibleAfterGameDate === game.gameDate) delete selection.eligibleAfterGameDate;
        await tx.update(draftRostersTable).set({ selections }).where(eq(draftRostersTable.id, owner.id));
        const transactions = await tx.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.ownerId, owner.id));
        const transaction = transactions.find(t => t.incomingPlayerId === String(selection.nhlPlayerId) && t.effectiveAt.toISOString() === selection.acquiredAt);
        if (transaction) await tx.update(poolTransactionsTable).set({ details: { ...transaction.details,
          eligibility: selection.eligibilityGames, eligibilityCorrectedBy: actor, eligibilityCorrectedAt: new Date().toISOString() } }).where(eq(poolTransactionsTable.id, transaction.id));
        changes = { before, after: selection };
      }
    }
    return recordAudit(tx, actor, input.action, input.reason, { input: d, ...changes }, requestId);
  });
  if (sendInvitation) {
    // Reservation commits before sending. Duplicate retries never resend a pending invitation.
    try {
      const invitation = await clerkClient.invitations.createInvitation({
        emailAddress: String(result.details.email), notify: true, ignoreExisting: false,
      });
      await db.update(poolAuditTable).set({ details: { ...result.details, status: "sent", invitationId: invitation.id } }).where(eq(poolAuditTable.id, result.id));
      return { ...result, details: { ...result.details, status: "sent" } };
    } catch {
      await db.update(poolAuditTable).set({ details: { ...result.details, status: "failed" } }).where(eq(poolAuditTable.id, result.id));
      throw new TransactionError("The invitation could not be sent (an invitation or account may already exist). The attempt is recorded; no roster or fee changed.", 502);
    }
  }
  return result;
}