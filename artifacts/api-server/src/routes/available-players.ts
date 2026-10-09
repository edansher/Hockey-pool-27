import { GetAvailablePlayersResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { availablePlayersService } from "../lib/available-players-service";

const router: IRouter = Router();

router.get("/available-players", async (_req, res, next): Promise<void> => {
  try {
    const snapshot = await availablePlayersService.getSnapshot();
    const parsed = GetAvailablePlayersResponse.parse(snapshot);
    res.json({
      ...parsed,
      asOf: parsed.asOf?.toISOString() ?? null,
      lastCatalogRefreshAt: parsed.lastCatalogRefreshAt?.toISOString() ?? null,
      nextRefreshAt: parsed.nextRefreshAt?.toISOString() ?? null,
      coverageThroughDate: parsed.coverageThroughDate?.toISOString().slice(0, 10) ?? null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;