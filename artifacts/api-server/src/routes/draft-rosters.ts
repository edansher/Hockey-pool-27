import { Router, type IRouter } from "express";
import { GetDraftRostersResponse } from "@workspace/api-zod";
import { loadDraftRosters } from "../lib/draft-roster-store";

const router: IRouter = Router();

router.get("/draft-rosters", async (_req, res): Promise<void> => {
  const rows = await loadDraftRosters();
  res.json(GetDraftRostersResponse.parse(rows));
});

export default router;