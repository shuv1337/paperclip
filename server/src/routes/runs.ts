import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns } from "@paperclipai/db";
import { isUuidLike } from "@paperclipai/shared";
import { completeAsyncHttpRun } from "../adapters/http/async-run.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";

const completeAsyncHttpRunSchema = z.object({
  status: z.enum(["succeeded", "failed"]),
  summary: z.string().max(20_000).nullable().optional(),
});

const OPEN_RUN_STATUSES = new Set(["queued", "running"]);

export function runRoutes(db: Db) {
  const router = Router();

  router.post(
    "/runs/:runId/complete",
    validate(completeAsyncHttpRunSchema),
    async (req, res) => {
      const runId = String(req.params.runId ?? "");
      if (!isUuidLike(runId)) {
        res.status(400).json({ error: "Invalid run id" });
        return;
      }
      if (req.actor.type !== "agent" || !req.actor.agentId) {
        res.status(401).json({ error: "Run token or agent API key required" });
        return;
      }
      if (
        req.actor.source === "agent_jwt" &&
        req.actor.runId &&
        req.actor.runId !== runId
      ) {
        res.status(403).json({ error: "Run token does not match this run" });
        return;
      }

      const run = await db
        .select({
          id: heartbeatRuns.id,
          companyId: heartbeatRuns.companyId,
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
        })
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, runId))
        .then((rows) => rows[0] ?? null);
      if (
        !run ||
        run.agentId !== req.actor.agentId ||
        (req.actor.companyId && run.companyId !== req.actor.companyId)
      ) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      if (!OPEN_RUN_STATUSES.has(run.status)) {
        res.status(409).json({
          error: "Run is not awaiting completion",
          status: run.status,
        });
        return;
      }

      const completed = completeAsyncHttpRun({
        runId,
        status: req.body.status,
        summary: req.body.summary ?? null,
        agentId: req.actor.agentId,
      });
      if (!completed.ok) {
        res.status(409).json({ error: "Run is not awaiting async completion" });
        return;
      }

      await logActivity(db, {
        companyId: run.companyId,
        actorType: "agent",
        actorId: req.actor.agentId,
        agentId: req.actor.agentId,
        runId,
        action: "heartbeat.async_completion_requested",
        entityType: "heartbeat_run",
        entityId: runId,
        details: { status: req.body.status },
      });

      res.status(200).json({
        ok: true,
        runId,
        status: req.body.status,
      });
    },
  );

  return router;
}
