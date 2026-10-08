type DraftSelectionIdentity = {
    assetType: "skater" | "goalieTeam";
    confirmedName?: string | null;
    confirmedTeam?: string | null;
    reviewNote?: string | null;
    identityCheckedAt?: string | null;
    nhlPlayerId?: number | null;
};
type DraftSelection = DraftSelectionIdentity & {
    round: number;
    originalText: string;
    confirmedLastName?: string | null;
};
export declare function needsDraftSelectionConfirmation(selection: DraftSelectionIdentity): boolean;
export declare function isDraftSelectionVerified(selection: DraftSelectionIdentity): boolean;
export declare function sortDraftSelections<T extends DraftSelection>(selections: readonly T[]): T[];
export {};
//# sourceMappingURL=draft-selection-order.d.ts.map