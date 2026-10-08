import type { DraftRoster, Transaction } from "./generated/api.schemas";
/** Display saved transaction metadata, with exact NHL-identity fallback for legacy history. */
export declare function transactionPlayerTeam(transaction: Transaction, side: "outgoing" | "incoming", rosters?: DraftRoster[]): string | null;
//# sourceMappingURL=transaction-team.d.ts.map