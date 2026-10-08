export declare const poolPollVotesTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "pool_poll_votes";
    schema: undefined;
    columns: {
        pollId: import("drizzle-orm/pg-core").PgColumn<{
            name: "poll_id";
            tableName: "pool_poll_votes";
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
        ownerId: import("drizzle-orm/pg-core").PgColumn<{
            name: "owner_id";
            tableName: "pool_poll_votes";
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
        answers: import("drizzle-orm/pg-core").PgColumn<{
            name: "answers";
            tableName: "pool_poll_votes";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, string>;
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
            $type: Record<string, string>;
        }>;
        submittedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "submitted_at";
            tableName: "pool_poll_votes";
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
//# sourceMappingURL=pool-poll-votes.d.ts.map