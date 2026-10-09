import type { Request, RequestHandler } from 'express';
import { draftRosters } from '../data/draft-rosters';
import { POOL_ADMIN_EMAIL } from '../lib/admin-identity';
import { canRecordForOwner } from '../lib/participant-identity';
import { participantAccounts } from '../lib/participant-accounts';
import { readParticipantAccess as readPinnedAccess } from './participant-access';

// Validate once at startup. Malformed/ambiguous mappings fail closed without
// logging or returning anybody's configured email.

/** Private directory for the protected administrator route only. */
export async function readParticipantEmailDirectory(owners: ReadonlyArray<{ id: string; name: string }>) {
  const accounts = await participantAccounts();
  return owners.map(owner => {
    const account = accounts.find(a => a.ownerId === owner.id);
    return { ownerId: owner.id, ownerName: owner.name, email: account?.email ?? null,
      isAdmin: account?.email === POOL_ADMIN_EMAIL };
  });
}

export async function readParticipantAccess(req: Request) {
  const access = await readPinnedAccess(req, draftRosters.map(owner => owner.id));
  return { authenticated: access.authenticated, authorized: access.ownerId !== null || access.admin,
    ownerId: access.ownerId, isAdmin: access.admin };
}

export const requireTransactionAccess: RequestHandler = async (req, res, next) => {
  try {
    const access = await readParticipantAccess(req);
    if (!access.authenticated) {
      res.status(401).json({ error: 'Sign in to record a transaction.' }); return;
    }
    if (!access.authorized || (typeof req.body?.ownerId === 'string' && !canRecordForOwner(access, req.body.ownerId))) {
      res.status(403).json({ error: 'A verified participant account can record transactions only for its linked roster.' }); return;
    }
    next();
  } catch (error) { next(error); }
};