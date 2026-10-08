import { z } from "zod/v4";
export declare const scoringRulesTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "pool_scoring_rules";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "pool_scoring_rules";
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
        config: import("drizzle-orm/pg-core").PgColumn<{
            name: "config";
            tableName: "pool_scoring_rules";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, number | boolean>;
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
            $type: Record<string, number | boolean>;
        }>;
        revision: import("drizzle-orm/pg-core").PgColumn<{
            name: "revision";
            tableName: "pool_scoring_rules";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        effectiveFrom: import("drizzle-orm/pg-core").PgColumn<{
            name: "effective_from";
            tableName: "pool_scoring_rules";
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
export declare const insertScoringRulesSchema: z.ZodObject<{
    id: z.ZodString;
    revision: z.ZodOptional<z.ZodInt>;
    config: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodBoolean]>>;
}, {
    out: {};
    in: {};
}>;
export type InsertScoringRules = z.infer<typeof insertScoringRulesSchema>;
export type ScoringRulesRecord = typeof scoringRulesTable.$inferSelect;
//# sourceMappingURL=scoring-rules.d.ts.map