export declare const participantAccountLinksTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "participant_accounts";
    schema: undefined;
    columns: {
        ownerId: import("drizzle-orm/pg-core").PgColumn<{
            name: "owner_id";
            tableName: "participant_accounts";
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
        clerkUserId: import("drizzle-orm/pg-core").PgColumn<{
            name: "clerk_user_id";
            tableName: "participant_accounts";
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
        clerkEnvironment: import("drizzle-orm/pg-core").PgColumn<{
            name: "clerk_environment";
            tableName: "participant_accounts";
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
        linkedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "linked_at";
            tableName: "participant_accounts";
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
    };
    dialect: "pg";
}>;
export declare const insertParticipantAccountLinkSchema: import("zod/v4").ZodObject<{
    ownerId: import("zod/v4").ZodString;
    clerkUserId: import("zod/v4").ZodString;
    clerkEnvironment: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
}, {
    out: {};
    in: {};
}>;
export type ParticipantAccountLink = typeof participantAccountLinksTable.$inferSelect;
//# sourceMappingURL=participant-accounts.d.ts.map