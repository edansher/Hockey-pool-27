import type { DraftRoster, Transaction } from "./generated/api.schemas";

/** Use the recorded position, so later roster changes cannot alter history. */
export function transactionPlayerPosition(transaction: Transaction, side: "outgoing" | "incoming", rosters: DraftRoster[] = []): string | null {
  const player = transaction.details?.[side];
  const recordedPosition = player && typeof player === "object" && "position" in player && typeof player.position === "string" ? player.position : null;
  const playerId = side === "outgoing" ? transaction.outgoingPlayerId : transaction.incomingPlayerId;
  const selection = playerId ? rosters.flatMap(roster => roster.selections).find(selection => selection.nhlPlayerId != null && String(selection.nhlPlayerId) === playerId) : null;
  const position = (recordedPosition ?? selection?.position ?? "").trim().toUpperCase();
  if (["D", "DEFENSE", "DEFENCE", "DEFENSEMAN", "DEFENCEMAN"].includes(position)) return "Defense";
  if (["F", "C", "L", "R", "LW", "RW", "FORWARD", "CENTER", "CENTRE"].includes(position)) return "Forward";
  return null;
}