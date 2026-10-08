import type { DraftRoster, DraftRosterSelection, PoolScoringRow, PoolScoringSnapshot } from "./generated/api.schemas";
export type PoolLeader = {
    ownerId: string;
    ownerName: string;
    round: number;
    assetType: "skater" | "goalie";
    position: DraftRosterSelection["position"];
    nhlPlayerId: number | null;
    name: string;
    team: string | null;
    goals: number | null;
    powerPlayGoals: number | null;
    shortHandedGoals: number | null;
    assists: number | null;
    overtimeGoals: number | null;
    poolPoints: number | null;
    gamesPlayed: number | null;
    wins: number | null;
    shutouts: number | null;
};
/** Goalie siblings share an original round, but never a scoring identity. */
export declare function poolLeaderId(leader: Pick<PoolLeader, "ownerId" | "round" | "assetType" | "nhlPlayerId">): string;
/**
 * Club picks remain original draft evidence only. Never consume their legacy
 * aggregate scores when joining named goalies or pending goalie-name slots.
 */
export declare function draftSelectionScoringRows(selection: DraftRosterSelection, rows: readonly PoolScoringRow[], ownerId?: string): PoolScoringRow[];
/**
 * Expands photo-confirmed goalies within their original draft slots, then joins
 * each individual by owner, round and NHL ID. Unnamed slots remain pending.
 * This intentionally does not assign leaderboard ranks; callers should use the
 * scoring snapshot status when deciding whether the results can be presented as
 * an official ranking.
 */
export declare function buildPoolLeaders(rosters: readonly DraftRoster[], snapshot?: PoolScoringSnapshot): PoolLeader[];
//# sourceMappingURL=pool-leaders.d.ts.map