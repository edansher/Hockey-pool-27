// Override with POOL_ADMIN_EMAIL in the copy's environment; defaults to the original pool administrator.
export const POOL_ADMIN_EMAIL = process.env.POOL_ADMIN_EMAIL?.trim() || "edansher@me.com";
export interface AdminIdentity {
  emailAddresses: Array<{ emailAddress: string; verification: { status: string } | null }>;
  banned?: boolean;
  locked?: boolean;
}

/** Only trusted Clerk backend records may be passed here, never request input. */
export function verifiedAdminEmail(user: AdminIdentity, configuredEmail: string | undefined): string | null {
  const allowed = configuredEmail?.trim().toLowerCase();
  if (!allowed || user.banned || user.locked) return null;
  const match = user.emailAddresses.find(address =>
    address.verification?.status === 'verified' && address.emailAddress.toLowerCase() === allowed);
  return match?.emailAddress ?? null;
}