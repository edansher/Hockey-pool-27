import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requirePoolAdmin } from "../middlewares/pool-admin";
import { adminManagementSnapshot, managePool } from "../lib/pool-management";
import { TransactionError } from "../lib/transaction-policy";

const router = Router();
router.get("/auth/config", (_req, res) => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) { res.status(503).json({ error: "Authentication is not configured." }); return; }
  res.json({ publishableKey });
});
router.use("/admin/manage", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store"); res.vary("Authorization"); res.vary("Cookie"); next();
});
router.get("/admin/manage", requirePoolAdmin, async (_req, res, next) => {
  try { res.json(await adminManagementSnapshot()); } catch (error) { next(error); }
});
router.post("/admin/manage", requirePoolAdmin, async (req, res, next) => {
  try { res.json(await managePool(req.body, getAuth(req).userId!)); }
  catch (error) {
    if (error instanceof TransactionError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
});
export default router;