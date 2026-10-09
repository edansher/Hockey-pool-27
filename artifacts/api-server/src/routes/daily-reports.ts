import { Router } from "express";
import { GetPublishedDailyReportResponse, GetDailyReportHistoryResponse, GetDailyReportHealthResponse } from "@workspace/api-zod";
import { requirePoolAdmin } from "../middlewares/pool-admin";
import { isCalendarDate } from "../lib/calendar-date";
import { dailyReportService } from "../lib/daily-report-service";

const router = Router();
router.get("/admin/reports/health", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.vary("Authorization"); res.vary("Cookie"); next();
}, requirePoolAdmin, async (_req, res, next) => {
  try { res.json(GetDailyReportHealthResponse.parse(await dailyReportService.getHealth())); }
  catch (error) { next(error); }
});
router.get("/reports", async (_req, res, next) => {
  try { res.json(GetDailyReportHistoryResponse.parse(await dailyReportService.history())); }
  catch (error) { next(error); }
});
router.get("/reports/:date", async (req, res, next) => {
  if (!isCalendarDate(req.params.date)) {
    res.status(400).json({ error: "Date must be a valid YYYY-MM-DD calendar date." });
    return;
  }
  try { res.json(GetPublishedDailyReportResponse.parse(await dailyReportService.getReport(req.params.date))); }
  catch (error) { next(error); }
});
export default router;