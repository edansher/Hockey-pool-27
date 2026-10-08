import { Router } from 'express';
import { GetParticipantAccessResponse } from '@workspace/api-zod';
import { readParticipantAccess } from '../middlewares/pool-participant';

const router = Router();
router.get('/participant/access', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try { res.json(GetParticipantAccessResponse.parse(await readParticipantAccess(req))); }
  catch (error) { next(error); }
});
export default router;