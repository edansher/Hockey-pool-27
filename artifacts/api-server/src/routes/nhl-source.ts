import { GetNhlSourceResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { nhlSourceService } from "../lib/nhl-source-service";

const router: IRouter = Router();

router.get("/nhl-source", async (_req, res, next) => {
  try {
    const snapshot = await nhlSourceService.getSnapshot();
    // Validate against the generated OpenAPI contract but keep date-only DTO
    // values as YYYY-MM-DD instead of serializing Zod-coerced Dates as datetimes.
    GetNhlSourceResponse.parse(snapshot);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;