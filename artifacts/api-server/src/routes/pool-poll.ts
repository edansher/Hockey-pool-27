import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { readParticipantAccess } from "../middlewares/pool-participant";
import { POOL_POLL } from "../lib/pool-poll";
import { PollError, pollService } from "../lib/pool-poll-store";

export function createPoolPollRouter(
  readAccess: typeof readParticipantAccess = readParticipantAccess,
  service: typeof pollService = pollService,
) {
  const router = Router();
  router.use("/poll", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store"); next();
  });
  const handle = (run: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try { await run(req, res); }
      catch (error) {
        if (error instanceof PollError) res.status(error.status).json({ error: error.message });
        else next(error);
      }
    };
  const adminOnly = handle(async (req, res) => {
    const access = await readAccess(req);
    if (!access.authenticated) { res.status(401).json({ error: "Sign in as administrator." }); return; }
    if (!access.isAdmin) { res.status(403).json({ error: "Administrators only." }); return; }
    // Dispatch only the explicit administrator routes. No client role is trusted.
    if (req.method === "GET") res.json(await service.admin());
    else if (req.path.endsWith("/drafts")) res.json(await service.saveDraft(req.body));
    else if (req.path.endsWith("/preview")) res.json(await service.preview(req.body));
    else if (req.path.endsWith("/edit")) res.json(await service.update(req.body));
    else if (typeof req.body?.pollId !== "string") res.status(400).json({ error: "Select a saved draft." });
    else if (req.path.endsWith("/delete")) res.json(await service.remove(req.body.pollId));
    else res.json(await service.publish(req.body.pollId));
  });
  router.get("/poll/admin", adminOnly);
  router.post("/poll/admin/drafts", adminOnly);
  router.post("/poll/admin/preview", adminOnly);
  router.post("/poll/admin/edit", adminOnly);
  router.post("/poll/admin/delete", adminOnly);
  router.post("/poll/admin/publish", adminOnly);
  router.get("/poll/daily", handle(async (req, res) => {
    const access = await readAccess(req);
    res.json(await service.daily(access.authenticated && access.authorized ? access.ownerId : null));
  }));
  router.get("/poll", handle(async (req, res) => {
    const access = await readAccess(req);
    const owner = access.authenticated && access.authorized ? access.ownerId : null;
    const daily = await service.daily(owner);
    res.json(daily.polls.find(p => p.publicationDate === daily.today) ?? await service.read(POOL_POLL.id, owner));
  }));
  router.post("/poll/popup", handle(async (req, res) => {
    const access = await readAccess(req);
    if (!access.authenticated || !access.authorized || !access.ownerId) { res.json({ poll: null }); return; }
    res.json(await service.claimPopup(access.ownerId));
  }));
  router.post("/poll/votes", handle(async (req, res) => {
    const access = await readAccess(req);
    if (!access.authenticated) { res.status(401).json({ error: "Sign in as a pool participant to vote." }); return; }
    if (!access.authorized || !access.ownerId) {
      res.status(403).json({ error: "Only a verified participant linked to a pool roster can vote." }); return;
    }
    if (typeof req.body?.pollId !== "string") { res.status(400).json({ error: "Select a poll." }); return; }
    res.json(await service.vote(req.body.pollId, access.ownerId, req.body?.answers));
  }));
  return router;
}

export default createPoolPollRouter();
