import type { DraftRoster, Transaction } from "./generated/api.schemas";

/** Display saved transaction metadata, with exact NHL-identity fallback for legacy history. */
export function transactionPlayerTeam(transaction: Transaction, side: "outgoing" | "incoming", rosters: DraftRoster[] = []): string | null {
  const player = transaction.details?.[side];
  const recorded = player && typeof player === "object" && !Array.isArray(player) &&
    "team" in player && typeof player.team === "string" ? player.team.trim() : "";
  if (recorded) return recorded;
  const playerId = side === "outgoing" ? transaction.outgoingPlayerId : transaction.incomingPlayerId;
  const selection = playerId ? rosters.flatMap(roster => roster.selections)
    .find(pick => pick.nhlPlayerId != null && String(pick.nhlPlayerId) === String(playerId)) : undefined;
  return selection?.confirmedTeam?.trim() || null;
}
