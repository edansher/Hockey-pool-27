import { randomUUID } from "node:crypto";
import { db, poolAuditTable } from "@workspace/db";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function recordAudit(tx: Tx, actor: string, action: string, reason: string,
  details: Record<string, unknown>, requestId: string = randomUUID()) {
  const [row] = await tx.insert(poolAuditTable).values({
    id: randomUUID(), actor, action, reason, details, requestId,
  }).returning();
  return row!;
}