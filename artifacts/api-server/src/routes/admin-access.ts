import { Router } from 'express';
import { GetAdminAccessResponse, GetAdminParticipantEmailsResponse } from '@workspace/api-zod';
import { readAdminAccess, requirePoolAdmin } from '../middlewares/pool-admin';
import { readParticipantEmailDirectory } from '../middlewares/pool-participant';
import { loadDraftRosters } from '../lib/draft-roster-store';

const router = Router();
router.get('/admin/access', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(GetAdminAccessResponse.parse(await readAdminAccess(req))); }
  catch (error) { next(error); }
});
router.get('/admin/participant-emails', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Authorization'); res.vary('Cookie');
  next();
}, requirePoolAdmin, async (_req, res, next) => {
  try {
    const owners = await loadDraftRosters();
    res.json(GetAdminParticipantEmailsResponse.parse(await readParticipantEmailDirectory(owners)));
  } catch (error) { next(error); }
});
export default router;