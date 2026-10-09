import type { Request, RequestHandler } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import { verifiedAdminEmail, POOL_ADMIN_EMAIL } from '../lib/admin-identity';

export async function readAdminAccess(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return { authenticated: false, authorized: false, email: null };
  const user = await clerkClient.users.getUser(userId);
  const adminEmail = verifiedAdminEmail(user, POOL_ADMIN_EMAIL);
  const primary = user.emailAddresses.find(address => address.id === user.primaryEmailAddressId);
  return { authenticated: true, authorized: adminEmail !== null, email: adminEmail ?? primary?.emailAddress ?? null };
}

export const requirePoolAdmin: RequestHandler = async (req, res, next) => {
  try {
    const access = await readAdminAccess(req);
    if (!access.authenticated) {
      res.status(401).json({ error: 'Sign in to access administrator controls.' }); return;
    }
    if (!access.authorized) {
      res.status(403).json({ error: 'This account is not an authorized pool administrator.' }); return;
    }
    next();
  } catch (error) { next(error); }
};