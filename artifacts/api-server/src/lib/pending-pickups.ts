import { eq } from "drizzle-orm";
import { db, draftRostersTable, poolTransactionsTable } from "@workspace/db";
import { eligibilityPlan, recheckEligibility, torontoDate } from "./pickup-eligibility";
import { NHL_TEAM_NAMES } from "../data/draft-roster-identities";
import { recordAudit } from "./pool-audit";

/** Resolve once against the original server instant; later refreshes cannot reopen excluded games. */
export async function resolvePendingPickups() {
  const rosters = await db.select().from(draftRostersTable);
  const pending = rosters.flatMap(owner => owner.selections.filter(s => s.eligibilityPending && s.acquiredAt && !s.voidedAt &&
    (!s.eligibilityCheckedAt || Date.parse(s.eligibilityCheckedAt) < Date.now() - 15000)).map(s => ({ ownerId: owner.id, selection: s })));
  if (!pending.length) return;
  const decisions = await Promise.all(pending.map(async p => {
    const team = Object.entries(NHL_TEAM_NAMES).find(([, name]) => name === p.selection.confirmedTeam)?.[0] ?? p.selection.confirmedTeam ?? "";
    const confirmation = new Date(p.selection.acquiredAt!);
    const plan = await eligibilityPlan(team, new Date(), torontoDate(confirmation));
    return { ...p, plan: recheckEligibility(plan, confirmation) };
  }));
  await db.transaction(async tx => {
    const locked = await tx.select().from(draftRostersTable).orderBy(draftRostersTable.id).for("update");
    for (const decision of decisions) {
      const owner = locked.find(o => o.id === decision.ownerId);
      const s = owner?.selections.find(s => s.round === decision.selection.round && s.acquiredAt === decision.selection.acquiredAt);
      if (!s?.eligibilityPending) continue;
      s.eligibilityCheckedAt = new Date().toISOString();
      if (!decision.plan.pendingVerification) {
        s.eligibilityPending = false; s.eligibilityGames = decision.plan.games;
        const missed = decision.plan.games.filter(g => g.eligible === false);
        s.scoringExcludedGameIds = [...new Set([...(s.scoringExcludedGameIds ?? []), ...missed.map(g => g.gameId)])];
        if (missed.length) s.eligibleAfterGameDate = missed.map(g => g.gameDate).sort().at(-1)!;
        const trades = await tx.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.ownerId, owner!.id));
        const trade = trades.find(t => t.incomingPlayerId === String(s.nhlPlayerId) && t.effectiveAt.toISOString() === s.acquiredAt);
        if (trade) await tx.update(poolTransactionsTable).set({ details: { ...trade.details,
          originalEligibility: trade.details?.eligibility, eligibility: decision.plan.games,
          pendingVerification: false, eligibilityResolvedAt: s.eligibilityCheckedAt } }).where(eq(poolTransactionsTable.id, trade.id));
        await recordAudit(tx, "system", "eligibility-resolution", "Official schedule verified against recorded confirmation time",
          { ownerId: owner!.id, round: s.round, confirmationTimestamp: s.acquiredAt, games: decision.plan.games });
      }
      await tx.update(draftRostersTable).set({ selections: owner!.selections }).where(eq(draftRostersTable.id, owner!.id));
    }
  });
}