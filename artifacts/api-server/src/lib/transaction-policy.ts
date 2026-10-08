export function requireRosterComposition(selections: ReadonlyArray<{ droppedAt?: string | null; position: string; assetType: string }>) {
  const active = selections.filter(s => !s.droppedAt);
  if (active.filter(s => s.position === "F" && s.assetType === "skater").length !== 13 ||
      active.filter(s => s.position === "D" && s.assetType === "skater").length !== 5 ||
      active.filter(s => s.assetType === "goalieTeam").length !== 2 || active.length !== 20) {
    throw new TransactionError("The active roster must contain exactly 13 forwards, 5 defencemen and 2 goalie teams. Ask the administrator to correct this roster.", 409);
  }
}
import type { DraftRosterSelection } from '@workspace/db';

export class TransactionError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

/** All entry points share this rule, including trusted workspace commands. */
export function requireSkaterDrop(selections: Array<DraftRosterSelection & {
  goalies?: Array<{ nhlPlayerId: number }>;
}>, playerId: number): DraftRosterSelection {
  if (selections.some(selection => selection.assetType === 'goalieTeam' &&
      selection.goalies?.some(goalie => goalie.nhlPlayerId === playerId))) {
    throw new TransactionError('Goalies cannot be dropped. Transactions are for skaters only.', 400);
  }
  const selection = selections.find(row => row.nhlPlayerId === playerId && !row.droppedAt);
  if (!selection) throw new TransactionError('The outgoing skater is not actively owned by this participant.');
  if (selection.assetType !== 'skater' || selection.position === 'G') {
    throw new TransactionError('Goalies cannot be dropped. Transactions are for skaters only.', 400);
  }
  return selection;
}

export function requireSkaterPickup(position: string): void {
  if (position === 'G') throw new TransactionError('Goalie transactions are not allowed. Choose a skater.', 400);
}