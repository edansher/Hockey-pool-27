export type TransactionNotice = {
    id: string;
    createdAt: string | Date;
    effectiveAt?: string | Date;
    reversedAt?: string | Date | null;
};
export declare const TRANSACTION_FLASH_WINDOW_MS: number;
export declare const TRANSACTION_SOUND_DURATION_MS = 25000;
export declare const TRANSACTION_TICKER_INTERVAL_MS = 8000;
/** Keep each unreversed drop visible for its own 24-hour ticker window. */
export declare function recentCompletedTransactions<T extends TransactionNotice>(records: readonly T[], nowMs?: number): T[];
/** Sound eligibility remains independent from the ticker and button windows. */
export declare function transactionAlertRemainingMs(transaction: TransactionNotice | null | undefined, nowMs?: number): number;
/** The drop instant wins over recording time; visits do not restart the ticker. */
export declare function transactionTickerRemainingMs(transaction: TransactionNotice | null | undefined, nowMs?: number): number;
/** Flash while any real, unreversed transaction is inside its own 24-hour window. */
export declare function transactionButtonRemainingMs(records: readonly TransactionNotice[], nowMs?: number): number;
/** Elapsed time from the backend record, not from a visit or an acknowledgement. */
export declare function transactionFlashRemainingMs(createdAt: string | Date | null | undefined, nowMs?: number): number;
/** Transaction history shows real calendar time, never the 2am pool-day label. */
export declare function formatTransactionTime(value: string | Date): string;
export declare function latestCompletedTransaction<T extends TransactionNotice>(records: readonly T[]): T | null;
//# sourceMappingURL=transaction-notifications.d.ts.map