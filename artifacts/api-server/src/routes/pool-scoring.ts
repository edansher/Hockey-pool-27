import { GetPoolScoringResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { nhlSourceService } from "../lib/nhl-source-service";
import { poolScoringService } from "../lib/pool-scoring-service";
import { teamAbbreviation } from "../lib/pool-scoring-service";
import { loadDraftRosters } from "../lib/draft-roster-store";

const router: IRouter = Router();

router.get("/pool-scoring", async (_req, res, next): Promise<void> => {
  try {
    const source = await nhlSourceService.getSnapshot();
    const snapshot = await poolScoringService.getSnapshot(source);
    // Zod converts OpenAPI dates to Date instances, but both date fields are
    // calendar/date-time strings on the wire.
    const rosters = await loadDraftRosters();
    const identities = rosters.flatMap(owner => owner.selections.flatMap(selection => {
      const team = teamAbbreviation(selection.confirmedTeam) ?? "";
      if (selection.assetType === "goalieTeam") return (selection.goalies ?? []).map(g => ({
        nhlPlayerId: g.nhlPlayerId, team, position: "G" as const,
      }));
      return selection.nhlPlayerId ? [{ nhlPlayerId: selection.nhlPlayerId, team, position: selection.position }] : [];
    }));
    const season = await poolScoringService.getLeaguePlayerScores(identities);
    const seasonPoints = new Map(season.rows.map(row => [row.nhlPlayerId, row.poolPoints]));
    const parsed = GetPoolScoringResponse.parse({ ...snapshot,
      rows: snapshot.rows.map(row => ({ ...row, seasonPoolPoints: row.nhlPlayerId ? seasonPoints.get(row.nhlPlayerId) ?? null : null })),
    });
    res.json({
      ...parsed,
      asOf: parsed.asOf?.toISOString() ?? null,
      coverageThroughDate: parsed.coverageThroughDate?.toISOString().slice(0, 10) ?? null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;