import { z } from "zod/v4";
export declare const ownershipScoreSchema: z.ZodObject<{
    goals: z.ZodNullable<z.ZodNumber>;
    assists: z.ZodNullable<z.ZodNumber>;
    powerPlayGoals: z.ZodNullable<z.ZodNumber>;
    shortHandedGoals: z.ZodNullable<z.ZodNumber>;
    overtimeGoals: z.ZodNullable<z.ZodNumber>;
    poolPoints: z.ZodNullable<z.ZodNumber>;
    gamesPlayed: z.ZodNullable<z.ZodNumber>;
    wins: z.ZodNullable<z.ZodNumber>;
    shutouts: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const draftRosterSelectionSchema: z.ZodObject<{
    round: z.ZodNumber;
    originalText: z.ZodString;
    assetType: z.ZodEnum<{
        skater: "skater";
        goalieTeam: "goalieTeam";
    }>;
    position: z.ZodEnum<{
        F: "F";
        D: "D";
        G: "G";
    }>;
    reviewNote: z.ZodNullable<z.ZodString>;
    confirmedName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confirmedTeam: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confirmedLastName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nhlPlayerId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    identityCheckedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    identitySource: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    acquiredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    droppedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    frozenScoring: z.ZodOptional<z.ZodObject<{
        goals: z.ZodNullable<z.ZodNumber>;
        assists: z.ZodNullable<z.ZodNumber>;
        powerPlayGoals: z.ZodNullable<z.ZodNumber>;
        shortHandedGoals: z.ZodNullable<z.ZodNumber>;
        overtimeGoals: z.ZodNullable<z.ZodNumber>;
        poolPoints: z.ZodNullable<z.ZodNumber>;
        gamesPlayed: z.ZodNullable<z.ZodNumber>;
        wins: z.ZodNullable<z.ZodNumber>;
        shutouts: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    scoringBaseline: z.ZodOptional<z.ZodObject<{
        goals: z.ZodNullable<z.ZodNumber>;
        assists: z.ZodNullable<z.ZodNumber>;
        powerPlayGoals: z.ZodNullable<z.ZodNumber>;
        shortHandedGoals: z.ZodNullable<z.ZodNumber>;
        overtimeGoals: z.ZodNullable<z.ZodNumber>;
        poolPoints: z.ZodNullable<z.ZodNumber>;
        gamesPlayed: z.ZodNullable<z.ZodNumber>;
        wins: z.ZodNullable<z.ZodNumber>;
        shutouts: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    scoringExcludedGameIds: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    ownershipDailyBaselines: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        goals: z.ZodNullable<z.ZodNumber>;
        assists: z.ZodNullable<z.ZodNumber>;
        powerPlayGoals: z.ZodNullable<z.ZodNumber>;
        shortHandedGoals: z.ZodNullable<z.ZodNumber>;
        overtimeGoals: z.ZodNullable<z.ZodNumber>;
        poolPoints: z.ZodNullable<z.ZodNumber>;
        gamesPlayed: z.ZodNullable<z.ZodNumber>;
        wins: z.ZodNullable<z.ZodNumber>;
        shutouts: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>>;
    frozenDailyScoring: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        goals: z.ZodNullable<z.ZodNumber>;
        assists: z.ZodNullable<z.ZodNumber>;
        powerPlayGoals: z.ZodNullable<z.ZodNumber>;
        shortHandedGoals: z.ZodNullable<z.ZodNumber>;
        overtimeGoals: z.ZodNullable<z.ZodNumber>;
        poolPoints: z.ZodNullable<z.ZodNumber>;
        gamesPlayed: z.ZodNullable<z.ZodNumber>;
        wins: z.ZodNullable<z.ZodNumber>;
        shutouts: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>>;
    frozenGoalieScoring: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        goals: z.ZodNullable<z.ZodNumber>;
        assists: z.ZodNullable<z.ZodNumber>;
        powerPlayGoals: z.ZodNullable<z.ZodNumber>;
        shortHandedGoals: z.ZodNullable<z.ZodNumber>;
        overtimeGoals: z.ZodNullable<z.ZodNumber>;
        poolPoints: z.ZodNullable<z.ZodNumber>;
        gamesPlayed: z.ZodNullable<z.ZodNumber>;
        wins: z.ZodNullable<z.ZodNumber>;
        shutouts: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>>;
    frozenDailyGoalieScoring: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodObject<{
        goals: z.ZodNullable<z.ZodNumber>;
        assists: z.ZodNullable<z.ZodNumber>;
        powerPlayGoals: z.ZodNullable<z.ZodNumber>;
        shortHandedGoals: z.ZodNullable<z.ZodNumber>;
        overtimeGoals: z.ZodNullable<z.ZodNumber>;
        poolPoints: z.ZodNullable<z.ZodNumber>;
        gamesPlayed: z.ZodNullable<z.ZodNumber>;
        wins: z.ZodNullable<z.ZodNumber>;
        shutouts: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>>>;
    eligibilityPolicy: z.ZodOptional<z.ZodLiteral<"scheduled-minus-one-minute">>;
    eligibilityPending: z.ZodOptional<z.ZodBoolean>;
    eligibilityCheckedAt: z.ZodOptional<z.ZodString>;
    adminGoalies: z.ZodOptional<z.ZodArray<z.ZodObject<{
        nhlPlayerId: z.ZodNumber;
        confirmedName: z.ZodString;
        confirmedTeam: z.ZodString;
        identitySource: z.ZodString;
    }, z.core.$strip>>>;
    eligibilityGames: z.ZodOptional<z.ZodArray<z.ZodObject<{
        gameId: z.ZodNumber;
        gameDate: z.ZodString;
        scheduledStart: z.ZodNullable<z.ZodString>;
        cutoff: z.ZodNullable<z.ZodString>;
        eligible: z.ZodNullable<z.ZodBoolean>;
        overriddenByAdministrator: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    eligibleAfterGameDate: z.ZodOptional<z.ZodString>;
    voidedAt: z.ZodOptional<z.ZodString>;
    identityCandidates: z.ZodOptional<z.ZodArray<z.ZodObject<{
        nhlPlayerId: z.ZodNumber;
        name: z.ZodString;
        team: z.ZodString;
        position: z.ZodEnum<{
            F: "F";
            D: "D";
        }>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type DraftRosterSelection = z.infer<typeof draftRosterSelectionSchema>;
export declare const draftRostersTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "draft_rosters";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "draft_rosters";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "draft_rosters";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        selections: import("drizzle-orm/pg-core").PgColumn<{
            name: "selections";
            tableName: "draft_rosters";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                round: number;
                originalText: string;
                assetType: "skater" | "goalieTeam";
                position: "F" | "D" | "G";
                reviewNote: string | null;
                confirmedName?: string | null | undefined;
                confirmedTeam?: string | null | undefined;
                confirmedLastName?: string | null | undefined;
                nhlPlayerId?: number | null | undefined;
                identityCheckedAt?: string | null | undefined;
                identitySource?: string | null | undefined;
                acquiredAt?: string | null | undefined;
                droppedAt?: string | null | undefined;
                frozenScoring?: {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                } | undefined;
                scoringBaseline?: {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                } | undefined;
                scoringExcludedGameIds?: number[] | undefined;
                ownershipDailyBaselines?: Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }> | undefined;
                frozenDailyScoring?: Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }> | undefined;
                frozenGoalieScoring?: Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }> | undefined;
                frozenDailyGoalieScoring?: Record<string, Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }>> | undefined;
                eligibilityPolicy?: "scheduled-minus-one-minute" | undefined;
                eligibilityPending?: boolean | undefined;
                eligibilityCheckedAt?: string | undefined;
                adminGoalies?: {
                    nhlPlayerId: number;
                    confirmedName: string;
                    confirmedTeam: string;
                    identitySource: string;
                }[] | undefined;
                eligibilityGames?: {
                    gameId: number;
                    gameDate: string;
                    scheduledStart: string | null;
                    cutoff: string | null;
                    eligible: boolean | null;
                    overriddenByAdministrator?: boolean | undefined;
                }[] | undefined;
                eligibleAfterGameDate?: string | undefined;
                voidedAt?: string | undefined;
                identityCandidates?: {
                    nhlPlayerId: number;
                    name: string;
                    team: string;
                    position: "F" | "D";
                }[] | undefined;
            }[];
            driverParam: unknown;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: {
                round: number;
                originalText: string;
                assetType: "skater" | "goalieTeam";
                position: "F" | "D" | "G";
                reviewNote: string | null;
                confirmedName?: string | null | undefined;
                confirmedTeam?: string | null | undefined;
                confirmedLastName?: string | null | undefined;
                nhlPlayerId?: number | null | undefined;
                identityCheckedAt?: string | null | undefined;
                identitySource?: string | null | undefined;
                acquiredAt?: string | null | undefined;
                droppedAt?: string | null | undefined;
                frozenScoring?: {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                } | undefined;
                scoringBaseline?: {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                } | undefined;
                scoringExcludedGameIds?: number[] | undefined;
                ownershipDailyBaselines?: Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }> | undefined;
                frozenDailyScoring?: Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }> | undefined;
                frozenGoalieScoring?: Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }> | undefined;
                frozenDailyGoalieScoring?: Record<string, Record<string, {
                    goals: number | null;
                    assists: number | null;
                    powerPlayGoals: number | null;
                    shortHandedGoals: number | null;
                    overtimeGoals: number | null;
                    poolPoints: number | null;
                    gamesPlayed: number | null;
                    wins: number | null;
                    shutouts: number | null;
                }>> | undefined;
                eligibilityPolicy?: "scheduled-minus-one-minute" | undefined;
                eligibilityPending?: boolean | undefined;
                eligibilityCheckedAt?: string | undefined;
                adminGoalies?: {
                    nhlPlayerId: number;
                    confirmedName: string;
                    confirmedTeam: string;
                    identitySource: string;
                }[] | undefined;
                eligibilityGames?: {
                    gameId: number;
                    gameDate: string;
                    scheduledStart: string | null;
                    cutoff: string | null;
                    eligible: boolean | null;
                    overriddenByAdministrator?: boolean | undefined;
                }[] | undefined;
                eligibleAfterGameDate?: string | undefined;
                voidedAt?: string | undefined;
                identityCandidates?: {
                    nhlPlayerId: number;
                    name: string;
                    team: string;
                    position: "F" | "D";
                }[] | undefined;
            }[];
        }>;
        importedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "imported_at";
            tableName: "draft_rosters";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        source: import("drizzle-orm/pg-core").PgColumn<{
            name: "source";
            tableName: "draft_rosters";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const insertDraftRosterSchema: z.ZodObject<{
    name: z.ZodString;
    id: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
    selections: z.ZodArray<z.ZodObject<{
        round: z.ZodNumber;
        originalText: z.ZodString;
        assetType: z.ZodEnum<{
            skater: "skater";
            goalieTeam: "goalieTeam";
        }>;
        position: z.ZodEnum<{
            F: "F";
            D: "D";
            G: "G";
        }>;
        reviewNote: z.ZodNullable<z.ZodString>;
        confirmedName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        confirmedTeam: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        confirmedLastName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nhlPlayerId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        identityCheckedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        identitySource: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        acquiredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        droppedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        frozenScoring: z.ZodOptional<z.ZodObject<{
            goals: z.ZodNullable<z.ZodNumber>;
            assists: z.ZodNullable<z.ZodNumber>;
            powerPlayGoals: z.ZodNullable<z.ZodNumber>;
            shortHandedGoals: z.ZodNullable<z.ZodNumber>;
            overtimeGoals: z.ZodNullable<z.ZodNumber>;
            poolPoints: z.ZodNullable<z.ZodNumber>;
            gamesPlayed: z.ZodNullable<z.ZodNumber>;
            wins: z.ZodNullable<z.ZodNumber>;
            shutouts: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
        scoringBaseline: z.ZodOptional<z.ZodObject<{
            goals: z.ZodNullable<z.ZodNumber>;
            assists: z.ZodNullable<z.ZodNumber>;
            powerPlayGoals: z.ZodNullable<z.ZodNumber>;
            shortHandedGoals: z.ZodNullable<z.ZodNumber>;
            overtimeGoals: z.ZodNullable<z.ZodNumber>;
            poolPoints: z.ZodNullable<z.ZodNumber>;
            gamesPlayed: z.ZodNullable<z.ZodNumber>;
            wins: z.ZodNullable<z.ZodNumber>;
            shutouts: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
        scoringExcludedGameIds: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        ownershipDailyBaselines: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            goals: z.ZodNullable<z.ZodNumber>;
            assists: z.ZodNullable<z.ZodNumber>;
            powerPlayGoals: z.ZodNullable<z.ZodNumber>;
            shortHandedGoals: z.ZodNullable<z.ZodNumber>;
            overtimeGoals: z.ZodNullable<z.ZodNumber>;
            poolPoints: z.ZodNullable<z.ZodNumber>;
            gamesPlayed: z.ZodNullable<z.ZodNumber>;
            wins: z.ZodNullable<z.ZodNumber>;
            shutouts: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>>;
        frozenDailyScoring: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            goals: z.ZodNullable<z.ZodNumber>;
            assists: z.ZodNullable<z.ZodNumber>;
            powerPlayGoals: z.ZodNullable<z.ZodNumber>;
            shortHandedGoals: z.ZodNullable<z.ZodNumber>;
            overtimeGoals: z.ZodNullable<z.ZodNumber>;
            poolPoints: z.ZodNullable<z.ZodNumber>;
            gamesPlayed: z.ZodNullable<z.ZodNumber>;
            wins: z.ZodNullable<z.ZodNumber>;
            shutouts: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>>;
        frozenGoalieScoring: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            goals: z.ZodNullable<z.ZodNumber>;
            assists: z.ZodNullable<z.ZodNumber>;
            powerPlayGoals: z.ZodNullable<z.ZodNumber>;
            shortHandedGoals: z.ZodNullable<z.ZodNumber>;
            overtimeGoals: z.ZodNullable<z.ZodNumber>;
            poolPoints: z.ZodNullable<z.ZodNumber>;
            gamesPlayed: z.ZodNullable<z.ZodNumber>;
            wins: z.ZodNullable<z.ZodNumber>;
            shutouts: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>>;
        frozenDailyGoalieScoring: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodObject<{
            goals: z.ZodNullable<z.ZodNumber>;
            assists: z.ZodNullable<z.ZodNumber>;
            powerPlayGoals: z.ZodNullable<z.ZodNumber>;
            shortHandedGoals: z.ZodNullable<z.ZodNumber>;
            overtimeGoals: z.ZodNullable<z.ZodNumber>;
            poolPoints: z.ZodNullable<z.ZodNumber>;
            gamesPlayed: z.ZodNullable<z.ZodNumber>;
            wins: z.ZodNullable<z.ZodNumber>;
            shutouts: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>>>;
        eligibilityPolicy: z.ZodOptional<z.ZodLiteral<"scheduled-minus-one-minute">>;
        eligibilityPending: z.ZodOptional<z.ZodBoolean>;
        eligibilityCheckedAt: z.ZodOptional<z.ZodString>;
        adminGoalies: z.ZodOptional<z.ZodArray<z.ZodObject<{
            nhlPlayerId: z.ZodNumber;
            confirmedName: z.ZodString;
            confirmedTeam: z.ZodString;
            identitySource: z.ZodString;
        }, z.core.$strip>>>;
        eligibilityGames: z.ZodOptional<z.ZodArray<z.ZodObject<{
            gameId: z.ZodNumber;
            gameDate: z.ZodString;
            scheduledStart: z.ZodNullable<z.ZodString>;
            cutoff: z.ZodNullable<z.ZodString>;
            eligible: z.ZodNullable<z.ZodBoolean>;
            overriddenByAdministrator: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>>;
        eligibleAfterGameDate: z.ZodOptional<z.ZodString>;
        voidedAt: z.ZodOptional<z.ZodString>;
        identityCandidates: z.ZodOptional<z.ZodArray<z.ZodObject<{
            nhlPlayerId: z.ZodNumber;
            name: z.ZodString;
            team: z.ZodString;
            position: z.ZodEnum<{
                F: "F";
                D: "D";
            }>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, {
    out: {};
    in: {};
}>;
export type InsertDraftRoster = z.infer<typeof insertDraftRosterSchema>;
export type DraftRoster = typeof draftRostersTable.$inferSelect;
//# sourceMappingURL=draft-rosters.d.ts.map