import { Router, type IRouter } from "express";
import { GetScoringRulesResponse } from "@workspace/api-zod";
import { loadPersistedScoringRules } from "../lib/scoring-rules-store";
import { requirePoolAdmin } from "../middlewares/pool-admin";
import { db } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { saveScoringRules } from "../lib/scoring-rules-update";
import { TransactionError } from "../lib/transaction-policy";
import { logger } from "../lib/logger";
import { recordAudit } from "../lib/pool-audit";

const router: IRouter = Router();

router.get("/scoring-rules", async (_req, res): Promise<void> => {
  const { rules, revision, effectiveFrom } = await loadPersistedScoringRules();
  res.json(GetScoringRulesResponse.parse({
    ...rules,
    revision,
    effectiveFrom,
  }));
});

router.patch("/scoring-rules", requirePoolAdmin, async (req, res, next): Promise<void> => {
  try {
    await loadPersistedScoringRules();
    const original = await loadPersistedScoringRules();
    const saved = await db.transaction(async tx => {
      const result = await saveScoringRules(tx, req.body);
      if (result.revision !== req.body.expectedRevision) await recordAudit(tx, getAuth(req).userId!, "scoring-rules",
        "Administrator confirmed historical scoring-rule changes", { before: original, after: result });
      return result;
    });
    logger.info({ userId: getAuth(req).userId, revision: saved.revision }, "Administrator saved scoring rules");
    res.json(GetScoringRulesResponse.parse(saved));
  } catch (error) {
    if (error instanceof TransactionError) {
      res.status(error.status).json({ error: error.message }); return;
    }
    next(error);
  }
});

export default router;