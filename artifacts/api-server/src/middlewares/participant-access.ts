import type { Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, participantAccountLinksTable as participantAccountsTable, participantAccountsTable as assignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { verifiedAdminEmail } from "../lib/admin-identity";
import type { AdminIdentity } from "../lib/admin-identity";
import { verifiedParticipantOwner } from "../lib/participant-identity";
import { participantAccounts } from "../lib/participant-accounts";
import { POOL_ADMIN_EMAIL } from "../lib/admin-identity";

export async function readParticipantAccess(req: Request, ownerIds: string[]) {
  const accounts = await participantAccounts();
  const mapping = new Map(accounts.filter(a => ownerIds.includes(a.ownerId) && a.email && !a.disabled)
    .map(a => [a.email!, a.ownerId]));
  const userId = getAuth(req).userId;
  const user = userId ? await clerkClient.users.getUser(userId) : null;
  const access = await resolveParticipantAccount(userId, user, mapping, POOL_ADMIN_EMAIL);
  if (access.ownerId) {
    const account = accounts.find(a => a.ownerId === access.ownerId)!;
    const updated = await db.update(assignmentsTable).set({ clerkUserId: userId }).where(and(
      eq(assignmentsTable.ownerId, access.ownerId), eq(assignmentsTable.email, account.email!),
      eq(assignmentsTable.disabled, false),
    )).returning({ ownerId: assignmentsTable.ownerId });
    if (!updated.length) return { ...access, ownerId: null };
  }
  return access;
}

/** Trusted Clerk records only. The DB argument allows isolated-schema tests. */
export async function resolveParticipantAccount(
  userId: string | null, user: AdminIdentity | null, mapping: Map<string, string>,
  adminEmail: string | undefined, database = db,
  environment: "development" | "production" = process.env.CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ? "development" : "production",
) {
  const base = { userId, authenticated: !!userId, admin: false, ownerId: null as string | null, configured: mapping.size > 0 };
  if (!userId || !user) return base;
  const admin = verifiedAdminEmail(user, adminEmail) !== null;
  const ownerId = verifiedParticipantOwner(user, mapping);
  if (!ownerId) return { ...base, admin };
  // Unique constraints pin both roster and account; competing claims cannot steal
  // a roster. Configuration and verified identity are rechecked on every request.
  await database.insert(participantAccountsTable).values({ ownerId, clerkUserId: userId, clerkEnvironment: environment }).onConflictDoNothing();
  const linked = await database.select().from(participantAccountsTable).where(and(
    eq(participantAccountsTable.ownerId, ownerId), eq(participantAccountsTable.clerkEnvironment, environment),
  ));
  return { ...base, admin, ownerId: linked[0]?.clerkUserId === userId ? ownerId : null };
}