import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  authUsers,
  companies,
  companyMemberships,
  createDb,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { resetAsyncHttpRunsForTests } from "../adapters/http/async-run.js";
import { actorMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/index.js";
import { issueRoutes } from "../routes/issues.js";
import { runRoutes } from "../routes/runs.js";
import { agentService } from "../services/agents.js";
import { heartbeatService } from "../services/heartbeat.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres HTTP adapter async run tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

const RESPONSIBLE_USER_ID = "http-async-responsible-user";
const PRIVATE_ALLOWLIST_ENV = "PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST";

type Webhook = {
  url: string;
  origin: string;
  payload: () => Record<string, unknown> | null;
  close: () => Promise<void>;
};

function startWebhook(): Promise<Webhook> {
  let payload: Record<string, unknown> | null = null;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ async: true }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const origin = `http://127.0.0.1:${address.port}`;
      resolve({
        url: `${origin}/hook`,
        origin,
        payload: () => payload,
        close: () => new Promise((done) => {
          server.close(() => done());
        }),
      });
    });
  });
}

describeEmbeddedPostgres("http adapter async runs", () => {
  let db!: ReturnType<typeof createDb>;
  let heartbeat!: ReturnType<typeof heartbeatService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let previousAllowlist: string | undefined;
  const webhooks: Webhook[] = [];

  beforeAll(async () => {
    previousAllowlist = process.env[PRIVATE_ALLOWLIST_ENV];
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-http-async-run-");
    db = createDb(tempDb.connectionString);
    const runtimeEnv = {
      ...process.env,
      PAPERCLIP_IN_WORKTREE: "false",
    };
    delete runtimeEnv.PAPERCLIP_DATABASE_RESTORE_IN_PROGRESS;
    delete runtimeEnv.PAPERCLIP_RESTORE_IN_PROGRESS;
    heartbeat = heartbeatService(db, { runtimeEnv });
    const now = new Date();
    await db.insert(authUsers).values({
      id: RESPONSIBLE_USER_ID,
      name: "Responsible User",
      email: "http-async-responsible@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  }, 60_000);

  afterEach(async () => {
    // A comment can queue a follow-up wake. Close the webhook and keep
    // resolving async sessions so that wake cannot sit in timeoutSec.
    await Promise.all(webhooks.splice(0).map((hook) => hook.close()));
    let stop = false;
    const releaseWaitingRuns = (async () => {
      while (!stop) {
        resetAsyncHttpRunsForTests();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })();
    try {
      await heartbeat.drainActiveRunExecutions();
    } finally {
      stop = true;
      await releaseWaitingRuns;
    }
    if (previousAllowlist === undefined) delete process.env[PRIVATE_ALLOWLIST_ENV];
    else process.env[PRIVATE_ALLOWLIST_ENV] = previousAllowlist;
    await db.execute(sql.raw(`TRUNCATE TABLE "companies" CASCADE`));
  }, 20_000);

  afterAll(async () => {
    await heartbeat?.drainActiveRunExecutions();
    await tempDb?.cleanup();
    if (previousAllowlist === undefined) delete process.env[PRIVATE_ALLOWLIST_ENV];
    else process.env[PRIVATE_ALLOWLIST_ENV] = previousAllowlist;
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use(actorMiddleware(db, { deploymentMode: "authenticated" }));
    app.use("/api", issueRoutes(db, {} as never));
    app.use("/api", runRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function seedHttpAgent(input: { url: string; timeoutSec: number }) {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Async HTTP",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
      defaultResponsibleUserId: RESPONSIBLE_USER_ID,
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: RESPONSIBLE_USER_ID,
      status: "active",
      membershipRole: "operator",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "WebhookAgent",
      role: "engineer",
      status: "idle",
      adapterType: "http",
      adapterConfig: {
        url: input.url,
        timeoutSec: input.timeoutSec,
        callbackBaseUrl: "https://paperclip.test",
      },
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Async webhook task",
      status: "todo",
      assigneeAgentId: agentId,
      responsibleUserId: RESPONSIBLE_USER_ID,
      issueNumber: 1,
      identifier: `${issuePrefix}-1`,
    });
    const apiKey = await agentService(db).createApiKey(
      agentId,
      "async",
      { kind: "standard" },
      { responsibleUserId: RESPONSIBLE_USER_ID },
    );
    return { companyId, agentId, issueId, token: apiKey.token };
  }

  async function waitFor(check: () => Promise<string | null>, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    let last: string | null = null;
    while (Date.now() < deadline) {
      last = await check();
      if (last === "ready") return;
      if (last && last !== "wait") throw new Error(last);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(last && last !== "wait" ? last : "timed out waiting for the async HTTP run");
  }

  it("keeps the run open for assignee writes and closes it on callback", async () => {
    const hook = await startWebhook();
    webhooks.push(hook);
    process.env[PRIVATE_ALLOWLIST_ENV] = hook.origin;
    const seeded = await seedHttpAgent({ url: hook.url, timeoutSec: 30 });
    const app = createApp();

    const queued = await heartbeat.invoke(
      seeded.agentId,
      "assignment",
      {
        issueId: seeded.issueId,
        taskId: seeded.issueId,
        wakeReason: "issue_assigned",
        responsibleUserId: RESPONSIBLE_USER_ID,
      },
      "system",
    );
    expect(queued).not.toBeNull();
    const runId = queued!.id;

    await waitFor(async () => {
      const run = await heartbeat.getRun(runId);
      if (!run) return "run missing";
      if (run.status === "running" && hook.payload()) return "ready";
      if (!["queued", "running"].includes(run.status)) {
        return `run became ${run.status} before the webhook (${run.errorCode ?? "no_code"}: ${run.error ?? "no error"})`;
      }
      return "wait";
    }, 20_000);

    await new Promise((resolve) => setTimeout(resolve, 250));
    const stillRunning = await heartbeat.getRun(runId);
    expect(stillRunning?.status).toBe("running");

    const [issue] = await db.select().from(issues).where(eq(issues.id, seeded.issueId));
    expect(issue?.status).toBe("in_progress");
    expect(issue?.checkoutRunId).toBe(runId);

    const callback = hook.payload()?.paperclipCallback as Record<string, unknown> | undefined;
    expect(callback).toMatchObject({
      runId,
      url: `https://paperclip.test/api/runs/${runId}/complete`,
      method: "POST",
      auth: "bearer",
    });
    expect(typeof callback?.token).toBe("string");

    const comment = await request(app)
      .post(`/api/issues/${seeded.issueId}/comments`)
      .set("Authorization", `Bearer ${seeded.token}`)
      .send({ body: "Async agent update" });
    expect(comment.status, JSON.stringify(comment.body)).toBe(201);

    const document = await request(app)
      .put(`/api/issues/${seeded.issueId}/documents/plan`)
      .set("Authorization", `Bearer ${seeded.token}`)
      .send({ format: "markdown", body: "# plan" });
    expect(document.status, JSON.stringify(document.body)).toBe(201);

    const duringWrites = await heartbeat.getRun(runId);
    expect(duringWrites?.status).toBe("running");

    const complete = await request(app)
      .post(`/api/runs/${runId}/complete`)
      .set("Authorization", `Bearer ${String(callback?.token)}`)
      .send({ status: "succeeded", summary: "done" });
    expect(complete.status, JSON.stringify(complete.body)).toBe(200);
    expect(complete.body).toMatchObject({ ok: true, runId, status: "succeeded" });

    await waitFor(async () => {
      const run = await heartbeat.getRun(runId);
      if (!run) return "run missing";
      if (run.status === "succeeded") return "ready";
      if (!["queued", "running"].includes(run.status)) {
        return `run became ${run.status} (${run.errorCode ?? "no_code"}: ${run.error ?? "no error"})`;
      }
      return "wait";
    }, 15_000);
  }, 60_000);

  it("marks the run timed out when the async callback never arrives", async () => {
    const hook = await startWebhook();
    webhooks.push(hook);
    process.env[PRIVATE_ALLOWLIST_ENV] = hook.origin;
    const seeded = await seedHttpAgent({ url: hook.url, timeoutSec: 1 });

    const queued = await heartbeat.invoke(
      seeded.agentId,
      "assignment",
      {
        issueId: seeded.issueId,
        taskId: seeded.issueId,
        wakeReason: "issue_assigned",
        responsibleUserId: RESPONSIBLE_USER_ID,
      },
      "system",
    );
    expect(queued).not.toBeNull();

    await waitFor(async () => {
      const run = await heartbeat.getRun(queued!.id);
      if (!run) return "run missing";
      if (run.status === "timed_out") return "ready";
      if (!["queued", "running"].includes(run.status)) {
        return `run became ${run.status} (${run.errorCode ?? "no_code"}: ${run.error ?? "no error"})`;
      }
      return "wait";
    }, 20_000);
  }, 60_000);
});
