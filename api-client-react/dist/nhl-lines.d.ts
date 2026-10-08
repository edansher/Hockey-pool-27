export declare const DAILY_FACEOFF_TEAMS_URL = "https://www.dailyfaceoff.com/teams";
export type NhlLineTeam = {
    abbreviation: string;
    name: string;
    slug: string;
};
/**
 * All 32 current NHL clubs and their published Daily Faceoff URLs.
 * Verified against the source directory on 2026-10-01. Player combinations are
 * intentionally not copied: opening the source always shows its latest page.
 * This informational directory must never change pool scoring or ownership.
 */
export declare const NHL_LINE_TEAMS: readonly NhlLineTeam[];
export declare function getDailyFaceoffLineUrl(team: NhlLineTeam): string;
//# sourceMappingURL=nhl-lines.d.ts.map