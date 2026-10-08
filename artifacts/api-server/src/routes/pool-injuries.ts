import { GetPoolInjuriesResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { poolInjuryService } from "../lib/pool-injury-service";

const router: IRouter = Router();

router.get("/pool-injuries", async (_req, res, next): Promise<void> => {
  try {
    const snapshot = await poolInjuryService.getSnapshot();
    res.json(GetPoolInjuriesResponse.parse(snapshot));
  } catch (error) {
    next(error);
  }
});

export default router;