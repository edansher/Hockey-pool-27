import { Router, type IRouter } from "express";
import { GetStandingsResponse } from "@workspace/api-zod";
import { loadDraftRosters } from "../lib/draft-roster-store";
import {
  completeRosterScoringTotals,
  scoredStandings,
} from "../lib/pool-standings";
import { isCalendarDate } from "../lib/calendar-date";
import { getPoolDates } from "@workspace/pool-calendar";
import { nhlSourceService } from "../lib/nhl-source-service";
import { poolScoringService } from "../lib/pool-scoring-service";
import { db, poolTransactionsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/standings", async (req, res, next): Promise<void> => {
  const date = req.query.date;
  if (date !== undefined && !isCalendarDate(date)) {
    res.status(400).json({ error: "Date must be a valid YYYY-MM-DD calendar date." });
    return;
  }
  try {
    const currentDate = getPoolDates(new Date()).today;
    const targetDate = typeof date === "string" ? date : currentDate;
    const source = await nhlSourceService.getSnapshot();
    const schedule = [source.today, source.lastNight].find(feed => feed?.date === targetDate) ?? null;
    const priorDateValue = new Date(`${targetDate}T00:00:00.000Z`);
    priorDateValue.setUTCDate(priorDateValue.getUTCDate() - 1);
    const priorDate = priorDateValue.toISOString().slice(0, 10);
    const [rosters, scoring, yesterday, today] = await Promise.all([
      loadDraftRosters(),
      poolScoringService.getSnapshot(source, targetDate),
      poolScoringService.getDailySnapshot(priorDate, source),
      poolScoringService.getDailySnapshot(targetDate, source),
    ]);
    const standingsDate = targetDate;
    let standings = scoredStandings(rosters, scoring, yesterday, today, standingsDate, false, schedule, targetDate);
    if (targetDate === currentDate && !standings.rows.some(row => row.rank !== null)) {
      // A pool-day rollover does not make still-live games a confirmed baseline.
      // Reuse the latest contiguous verified cutoff and retain known points since it.
      const baselineDate = scoring.coverageThroughDate && scoring.coverageThroughDate < targetDate
        ? scoring.coverageThroughDate
        : priorDate;
      const [baselineScoring, baselineDaily] = await Promise.all([
        poolScoringService.getSnapshot(source, baselineDate),
        baselineDate === priorDate
          ? Promise.resolve(yesterday)
          : poolScoringService.getDailySnapshot(baselineDate, source),
      ]);
      const baselineHasVerifiedCoverage =
        baselineScoring.coverageThroughDate !== null &&
        baselineScoring.coverageThroughDate >= baselineDate &&
        (baselineScoring.status === "available" || baselineScoring.status === "stale");
      const baselineDailyComplete =
        baselineDaily.date === baselineDate &&
        (baselineDaily.status === "final" || baselineDaily.verifiedFinalCoverage === true) &&
        rosters.every(owner => baselineDaily.owners.some(row => row.ownerId === owner.id));
      const baselineRowsComplete =
        completeRosterScoringTotals(rosters, baselineScoring.rows) !== null;
      if (baselineHasVerifiedCoverage && baselineDailyComplete && baselineRowsComplete) {
        const interveningDays = [];
        const cursor = new Date(`${baselineDate}T00:00:00.000Z`);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        while (cursor.toISOString().slice(0, 10) < targetDate) {
          const day = cursor.toISOString().slice(0, 10);
          interveningDays.push(day === priorDate
            ? yesterday
            : await poolScoringService.getDailySnapshot(day, source));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        const confirmed = scoredStandings(
          rosters,
          baselineScoring,
          yesterday,
          today,
          standingsDate,
          true,
          schedule,
          targetDate,
          { baselineDate, baselineDaily, interveningDays },
        );
        if (confirmed.rows.length > 0 && confirmed.rows.every(row => row.rank !== null)) {
          standings = confirmed;
        }
      }
    }
    const completed = await db.select({ ownerId: poolTransactionsTable.ownerId,
      effectiveAt: poolTransactionsTable.effectiveAt }).from(poolTransactionsTable);
    const used = new Map<string, number>();
    for (const trade of completed) {
      if (getPoolDates(trade.effectiveAt).today > targetDate) continue;
      used.set(trade.ownerId, (used.get(trade.ownerId) ?? 0) + 1);
    }
    const snapshot = GetStandingsResponse.parse({ ...standings,
      rows: standings.rows.map(row => ({ ...row, transactionsUsed: used.get(row.id) ?? 0,
        todayScorers: targetDate === currentDate && today.status !== "unavailable" && row.livePoints !== null
          ? today.scoring.filter(player => player.ownerId === row.id)
          : undefined,
        yesterdayScorers: yesterday.date === priorDate && yesterday.status !== "unavailable" && row.yesterdayPoints !== null
          ? yesterday.scoring.filter(player => player.ownerId === row.id)
          : undefined,
      })) });
    // The generated validator coerces calendar-only OpenAPI dates to Date.
    res.json({ ...snapshot, date: snapshot.date?.toISOString().slice(0, 10) ?? null });
  } catch (error) {
    next(error);
  }
});

export default router;