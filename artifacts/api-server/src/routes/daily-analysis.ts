import { Router, type IRouter } from "express";
import {
  GetDailyAnalysisResponse,
  GetDailyScoringResponse,
} from "@workspace/api-zod";
import { isCalendarDate } from "../lib/calendar-date";
import { nhlSourceService } from "../lib/nhl-source-service";
import { poolScoringService } from "../lib/pool-scoring-service";

const router: IRouter = Router();

router.get("/analysis/:date", async (req, res, next): Promise<void> => {
  const date = req.params.date;
  if (!isCalendarDate(date)) {
    res.status(400).json({ error: "Date must be a valid YYYY-MM-DD calendar date." });
    return;
  }
  try {
    const source = await nhlSourceService.getSnapshot();
    const report = GetDailyAnalysisResponse.parse(
      await poolScoringService.getDailySnapshot(date, source),
    );
    res.json({ ...report, date: report.date.toISOString().slice(0, 10) });
  } catch (error) {
    next(error);
  }
});

router.get("/daily-scoring/:date", async (req, res, next): Promise<void> => {
  if (!isCalendarDate(req.params.date)) {
    res.status(400).json({ error: "Date must be a valid YYYY-MM-DD calendar date." });
    return;
  }
  try {
    const source = await nhlSourceService.getSnapshot();
    const report = await poolScoringService.getDailySnapshot(req.params.date, source);
    if (report.status !== "final") {
      res.status(503).json({ error: report.summary });
      return;
    }
    res.json(GetDailyScoringResponse.parse(report.scoring));
  } catch (error) {
    next(error);
  }
});

export default router;