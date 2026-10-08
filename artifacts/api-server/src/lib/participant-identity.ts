import type { AdminIdentity } from "./admin-identity";

/** Compatibility with the existing private participant-access endpoint. */
export function parseParticipantBindings(raw: string | undefined, knownOwners: ReadonlySet<string>): ReadonlyMap<string, string> {
  return participantEmailMap(raw, [...knownOwners]);
}
export function verifiedParticipantOwner(user: AdminIdentity, mapping: ReadonlyMap<string, string>): string | null {
  if (user.banned || user.locked) return null;
  const verified = new Set(user.emailAddresses.filter(row => row.verification?.status === "verified")
    .map(row => row.emailAddress.trim().toLowerCase()));
  const matches = new Set([...verified].map(email => mapping.get(email)).filter((owner): owner is string => owner !== undefined));
  return matches.size === 1 ? [...matches][0]! : null;
}
export function canRecordForOwner(access: { isAdmin: boolean; ownerId: string | null }, ownerId: string): boolean {
  return mayRecordForOwner({ admin: access.isAdmin, ownerId: access.ownerId }, ownerId);
}

export function mayRecordForOwner(access: { admin: boolean; ownerId: string | null }, ownerId: string): boolean {
  return access.admin || (access.ownerId !== null && access.ownerId === ownerId);
}

/** Administrator-only output: callers must enforce server-side authorization. */
export function participantEmailDirectory(
  owners: ReadonlyArray<{ id: string; name: string }>,
  bindings: ReadonlyMap<string, string>,
  configuredAdminEmail: string | undefined,
) {
  const byOwner = new Map([...bindings].map(([email, ownerId]) => [ownerId, email]));
  const adminEmail = configuredAdminEmail?.trim().toLowerCase();
  return owners.map(owner => {
    const email = byOwner.get(owner.id) ?? null;
    return { ownerId: owner.id, ownerName: owner.name, email, isAdmin: email !== null && email === adminEmail };
  }).sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

/** Private, server-only owner-supplied configuration. Fail closed on ambiguity. */
export function participantEmailMap(raw: string | undefined, ownerIds: string[]): Map<string, string> {
  if (!raw) return new Map();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid participant account configuration");
  const result = new Map<string, string>();
  for (const [ownerId, email] of Object.entries(value)) {
    if (!ownerIds.includes(ownerId) || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new Error("Invalid participant account configuration");
    }
    const normalized = email.trim().toLowerCase();
    if (result.has(normalized)) throw new Error("Ambiguous participant account configuration");
    result.set(normalized, ownerId);
  }
  return result;
}
