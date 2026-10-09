import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  draftRosterSelectionSchema,
  draftRostersTable,
} from "@workspace/db";
import { draftRosters } from "../data/draft-rosters";
import {
  addConfirmedGoalies,
  enrichDraftRosterSelections,
} from "./draft-roster-identity";

type DraftRosterTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const legacyTeamNames: Record<string, { previous: string; current: string }> = {
  cohen: { previous: "COHEN - P", current: "COHEN" },
  nana: { previous: "NANA - P", current: "NANA" },
  weezbark: { previous: "WEEZBARK - 1/2", current: "WEEZBARK" },
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export async function lockDraftRosterRowsForEnrichment(
  transaction: DraftRosterTransaction,
  ownerIds?: readonly string[],
) {
  const columns = {
    id: draftRostersTable.id,
    name: draftRostersTable.name,
    selections: draftRostersTable.selections,
  };
  const ids = ownerIds && [...new Set(ownerIds)].sort();

  if (ids) {
    if (ids.length === 0) return [];
    return transaction.select(columns)
      .from(draftRostersTable)
      .where(inArray(draftRostersTable.id, ids))
      .orderBy(asc(draftRostersTable.id))
      .for("update");
  }

  return transaction.select(columns)
    .from(draftRostersTable)
    .orderBy(asc(draftRostersTable.id))
    .for("update");
}

export async function persistEnrichedDraftRosterRows(
  transaction: DraftRosterTransaction,
  rows: Awaited<ReturnType<typeof lockDraftRosterRowsForEnrichment>>,
) {
  const enrichedRows = [];
  for (const row of rows) {
    const rename = legacyTeamNames[row.id];
    const name = rename && row.name === rename.previous ? rename.current : row.name;
    const selections = draftRosterSelectionSchema.array().parse(row.selections);
    const enrichedSelections = enrichDraftRosterSelections(row.id, selections);
    if (name !== row.name || stableSerialize(selections) !== stableSerialize(enrichedSelections)) {
      await transaction.update(draftRostersTable)
        .set({ name, selections: enrichedSelections })
        .where(eq(draftRostersTable.id, row.id));
    }
    enrichedRows.push({ ...row, name, selections: enrichedSelections });
  }

  return enrichedRows.map(row => ({
    ...row,
    selections: addConfirmedGoalies(row.id, row.selections),
  }));
}

export async function loadDraftRosters() {
  return db.transaction(async transaction => {
    await transaction.insert(draftRostersTable).values(
      draftRosters.map(({ id, name, selections }) => ({ id, name, selections })),
    ).onConflictDoNothing();

    const rows = await lockDraftRosterRowsForEnrichment(transaction);
    return persistEnrichedDraftRosterRows(transaction, rows);
  });
}