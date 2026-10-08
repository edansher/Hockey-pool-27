/** A finite chime. Suspended browser audio waits for a real user gesture. */
export declare function startTransactionChime(options: {
    pendingWindowMs: number;
    onStart: () => void;
    onBlocked: () => void;
    onStop: () => void;
}): () => void;
//# sourceMappingURL=transaction-chime.d.ts.map