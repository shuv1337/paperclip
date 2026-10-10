import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeAsyncHttpRun, resetAsyncHttpRunsForTests } from "../http/async-run.js";
import { execute } from "./execute.js";
import { GROK_BOT_SIGNATURE_HEADER } from "./auth.js";

const guardedFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../http/remote-fetch.js", () => ({
  guardedHttpAdapterFetch: guardedFetchMock,
}));

const previousApiUrl = process.env.PAPERCLIP_API_URL;

afterEach(() => {
  guardedFetchMock.mockReset();
  resetAsyncHttpRunsForTests();
  if (previousApiUrl === undefined) delete process.env.PAPERCLIP_API_URL;
  else process.env.PAPERCLIP_API_URL = previousApiUrl;
});

const agent = {
  id: "agent-1",
  companyId: "company-1",
  name: "Nick Nack",
  adapterType: "grok_bot",
  adapterConfig: {},
};

const runtime = {
  sessionId: null,
  sessionParams: null,
  sessionDisplayId: null,
  taskKey: null,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function staysPending(promise: Promise<unknown>, ms = 40) {
  let settled = false;
  const tracked = promise.then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return { settled, tracked };
}

describe("grok_bot adapter execute", () => {
  it("posts a wake payload and keeps the run open until the callback", async () => {
    process.env.PAPERCLIP_API_URL = "https://paperclip.test/api";
    let payload: Record<string, unknown> | null = null;
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer webhook-secret");
      expect(headers["content-type"]).toBe("application/json");
      return jsonResponse(200, { ok: true });
    });

    const pending = execute({
      runId: "run-1",
      agent,
      runtime,
      config: {
        webhookUrl: "https://bot.example/hook",
        webhookKey: "webhook-secret",
        contextBlock: "Prefer short comments.",
      },
      context: {
        wakeReason: "issue_assigned",
        issueId: "issue-1",
        paperclipWake: {
          reason: "issue_assigned",
          issue: {
            id: "issue-1",
            identifier: "PAP-7",
            title: "Wake the bot",
            description: "Comment, then call back.",
            status: "in_progress",
          },
          comments: [{ id: "comment-1", body: "Please start." }],
        },
      },
      onLog: async () => {},
    });
    const gate = await staysPending(pending);
    expect(gate.settled).toBe(false);
    expect(guardedFetchMock).toHaveBeenCalledWith(
      "https://bot.example/hook",
      expect.objectContaining({ method: "POST" }),
    );
    expect(payload).toMatchObject({
      kind: "wake",
      runId: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
      paperclipApiUrl: "https://paperclip.test/api",
      contextBlock: "Prefer short comments.",
      task: {
        issueId: "issue-1",
        identifier: "PAP-7",
        title: "Wake the bot",
        description: "Comment, then call back.",
        status: "in_progress",
        wakeReason: "issue_assigned",
        comments: [{ id: "comment-1", body: "Please start." }],
      },
    });
    const callback = (payload as unknown as Record<string, unknown>).paperclipCallback as Record<string, unknown>;
    expect(callback).toMatchObject({
      runId: "run-1",
      url: "https://paperclip.test/api/runs/run-1/complete",
      method: "POST",
      auth: "bearer",
    });

    completeAsyncHttpRun({
      runId: "run-1",
      token: String(callback.token),
      status: "succeeded",
      summary: "commented and finished",
    });
    await expect(gate.tracked).resolves.toMatchObject({
      exitCode: 0,
      timedOut: false,
      summary: "commented and finished",
    });
  });

  it("keeps a stored Bearer prefix and signs HMAC over the raw body", async () => {
    let signed = "";
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      signed = String(init?.body);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      const expected = createHmac("sha256", "hmac-secret").update(signed).digest("hex");
      expect(headers[GROK_BOT_SIGNATURE_HEADER]).toBe(`sha256=${expected}`);
      return new Response(null, { status: 204 });
    });

    const pending = execute({
      runId: "run-hmac",
      agent,
      runtime,
      config: {
        webhookUrl: "https://bot.example/hook",
        webhookKey: "hmac-secret",
        webhookAuth: "hmac",
        timeoutSec: 30,
      },
      context: {},
      onLog: async () => {},
    });
    const gate = await staysPending(pending);
    expect(gate.settled).toBe(false);
    expect(signed).toContain("\"kind\":\"wake\"");
    completeAsyncHttpRun({ runId: "run-hmac", agentId: "agent-1", status: "succeeded" });
    await gate.tracked;
  });

  it("does not double-prefix a key that already includes Bearer", async () => {
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer already-set");
      return new Response(null, { status: 200 });
    });

    const pending = execute({
      runId: "run-bearer",
      agent,
      runtime,
      config: {
        webhookUrl: "https://bot.example/hook",
        webhookKey: "Bearer already-set",
        responseMode: "async",
      },
      context: {},
      onLog: async () => {},
    });
    const gate = await staysPending(pending);
    expect(gate.settled).toBe(false);
    completeAsyncHttpRun({ runId: "run-bearer", agentId: "agent-1", status: "succeeded" });
    await gate.tracked;
  });

  it("fails when HMAC is selected without a key", async () => {
    await expect(execute({
      runId: "run-missing",
      agent,
      runtime,
      config: { webhookUrl: "https://bot.example/hook", webhookAuth: "hmac" },
      context: {},
      onLog: async () => {},
    })).rejects.toThrow(/webhookKey/);
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unresolved secret reference", async () => {
    await expect(execute({
      runId: "run-secret",
      agent,
      runtime,
      config: {
        webhookUrl: "https://bot.example/hook",
        webhookKey: { type: "secret_ref", secretId: "11111111-1111-4111-8111-111111111111", version: "latest" },
      },
      context: {},
      onLog: async () => {},
    })).rejects.toThrow(/resolved string/);
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });
});
