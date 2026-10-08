import { eq } from "drizzle-orm";
import { db, participantAccountsTable } from "@workspace/db";
import { loadDraftRosters } from "./draft-roster-store";
import { parseParticipantBindings } from "./participant-identity";
import type { AdminIdentity } from "./admin-identity";

let initialized: Promise<void> | null = null;
export function initializeParticipantAccounts() {
  if (!initialized) initialized = (async () => {
    const owners = await loadDraftRosters();
    let bindings: ReadonlyMap<string, string> = new Map();
    // Invalid or ambiguous legacy configuration cannot grant anybody ownership.
    try { bindings = parseParticipantBindings(process.env.POOL_PARTICIPANT_EMAILS, new Set(owners.map(o => o.id))); }
    catch { /* Missing assignments remain visible to the administrator. */ }
    const emails = new Map([...bindings].map(([email, id]) => [id, email]));
    await db.insert(participantAccountsTable).values(owners.map(owner => ({
      ownerId: owner.id, email: emails.get(owner.id) ?? null,
    }))).onConflictDoNothing();
  })().catch(error => { initialized = null; throw error; });
  return initialized;
}
export async function participantAccounts() {
  await initializeParticipantAccounts();
  return db.select().from(participantAccountsTable);
}
export async function linkedParticipant(user: AdminIdentity, userId: string) {
  const accounts = await participantAccounts();
  const map = new Map(accounts.filter(a => a.email && !a.disabled).map(a => [a.email!, a.ownerId]));
  const { resolveParticipantAccount } = await import("../middlewares/participant-access");
  const ownerId = (await resolveParticipantAccount(userId, user, map, undefined)).ownerId;
  if (!ownerId) return null;
  // Only a trusted, verified Clerk identity can create/update this association.
  // Verified-email matching also supports separate dev/live Clerk user stores.
  await db.update(participantAccountsTable).set({ clerkUserId: userId })
    .where(eq(participantAccountsTable.ownerId, ownerId));
  return ownerId;
}