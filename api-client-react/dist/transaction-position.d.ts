import type { DraftRoster, Transaction } from "./generated/api.schemas";
/** Use the recorded position, so later roster changes cannot alter history. */
export declare function transactionPlayerPosition(transaction: Transaction, side: "outgoing" | "incoming", rosters?: DraftRoster[]): string | null;
//# sourceMappingURL=transaction-position.d.ts.map