import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { loadAppSnapshot } from "../services/app-snapshot.js";

export const appSnapshotRouter = Router();

appSnapshotRouter.get("/", requireAuth, async (req, res) => {
  res.json(await loadAppSnapshot(req.auth.organizationId, req.auth.role));
});
