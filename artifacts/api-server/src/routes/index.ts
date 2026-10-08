import { Router, type IRouter } from "express";
import healthRouter from "./health";
import draftRostersRouter from "./draft-rosters";
import scoringRulesRouter from "./scoring-rules";
import standingsRouter from "./standings";
import dailyAnalysisRouter from "./daily-analysis";
import dailyReportsRouter from "./daily-reports";
import nhlSourceRouter from "./nhl-source";
import poolScoringRouter from "./pool-scoring";
import poolInjuriesRouter from "./pool-injuries";
import availablePlayersRouter from "./available-players";
import transactionsRouter from "./transactions";
import adminAccessRouter from "./admin-access";
import participantAccessRouter from "./participant-access";
import poolManagementRouter from "./pool-management";
import poolPollRouter from "./pool-poll";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminAccessRouter);
router.use(participantAccessRouter);
router.use(poolManagementRouter);
router.use(poolPollRouter);
router.use(draftRostersRouter);
router.use(scoringRulesRouter);
router.use(standingsRouter);
router.use(dailyAnalysisRouter);
router.use(dailyReportsRouter);
router.use(nhlSourceRouter);
router.use(poolScoringRouter);
router.use(poolInjuriesRouter);
router.use(availablePlayersRouter);
router.use(transactionsRouter);

export default router;
