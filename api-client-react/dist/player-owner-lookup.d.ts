import type { DraftRoster } from "./generated/api.schemas";
export interface PlayerOwnerMatch {
    key: string;
    playerName: string;
    team: string | null;
    position: "F" | "D" | "G";
    ownerId: string;
    ownerName: string;
    verified: boolean;
}
export declare const normalizePlayerSearch: (value: string) => string;
/** Current ownership only: retained dropped picks are scoring history, not owners. */
export declare function findPlayerOwners(rosters: DraftRoster[], query: string): PlayerOwnerMatch[];
//# sourceMappingURL=player-owner-lookup.d.ts.map