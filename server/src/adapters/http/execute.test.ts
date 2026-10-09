import { afterEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_INTENT_AGENT_GUIDANCE } from "@paperclipai/shared";
import { completeAsyncHttpRun, resetAsyncHttpRunsForTests } from "./async-run.js";
import { execute, httpRunCompleteUrl } from "./execute.js";

const guardedFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./remote-fetch.js", () => ({
  guardedHttpAdapterFetch: guardedFetchMock,
}));

afterEach(() => {
  guardedFetchMock.mockReset();
  resetAsyncHttpRunsForTests();
});

const agent = {
  id: "agent-1",
  companyId: "company-1",
  name: "Agent",
  adapterType: "http",
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

describe("http adapter execute", () => {
  it("delivers the complete runtime connection descriptor and shared guidance", async () => {
    const onDispatch = vi.fn();
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      expect(onDispatch).toHaveBeenCalledOnce();
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.paperclipRuntimeTools).toEqual({
        version: 1,
        guidance: CONNECTION_INTENT_AGENT_GUIDANCE,
        mcpEndpoint: "https://paperclip.test/mcp/runtime-tools",
        rest: {
          connectionsSearch: "https://paperclip.test/runtime-tools/connections/search",
          connectionRequest: "https://paperclip.test/runtime-tools/connections/request",
        },
        bearerToken: "run-token",
        expiresAt: "2026-08-26T15:00:00.000Z",
        tools: ["connections_search", "connection_request"],
      });
      return new Response(null, { status: 204 });
    });

    await execute({
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Agent",
        adapterType: "http",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: { url: "https://example.test/webhook" },
      context: {},
      runtimeTools: {
        version: 1,
        guidance: CONNECTION_INTENT_AGENT_GUIDANCE,
        mcpEndpoint: "https://paperclip.test/mcp/runtime-tools",
        rest: {
          connectionsSearch: "https://paperclip.test/runtime-tools/connections/search",
          connectionRequest: "https://paperclip.test/runtime-tools/connections/request",
        },
        bearerToken: "run-token",
        expiresAt: "2026-08-26T15:00:00.000Z",
        tools: ["connections_search", "connection_request"],
      },
      onLog: async () => {},
      onDispatch,
    });

    expect(guardedFetchMock).toHaveBeenCalledOnce();
    expect(onDispatch).toHaveBeenCalledOnce();
  });

  it("sends the server snapshot instead of a configured payload instruction block", async () => {
    const snapshot = { text: "Use the release handbook.", digest: "server-digest" };
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).connectionInstructions).toEqual(snapshot);
      return new Response(null, { status: 204 });
    });
    await execute({ runId: "run-1", agent: { id: "agent-1", companyId: "company-1", name: "Agent", adapterType: "http", adapterConfig: {} }, runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { url: "https://example.test/webhook", payloadTemplate: { connectionInstructions: { text: "forged" } } }, context: { connectionInstructions: snapshot }, onLog: async () => {},
    });
    expect(guardedFetchMock).toHaveBeenCalledOnce();
  });

  it("reports configured request timeout as timed_out", async () => {
    guardedFetchMock.mockImplementation(
      (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );

    const result = await execute({
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Agent",
        adapterType: "http",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: {
        url: "https://example.test/webhook",
        timeoutMs: 1,
      },
      context: {},
      onLog: async () => {},
    });

    expect(result.timedOut).toBe(true);
    expect(result.errorCode).toBe("timeout");
    expect(result.errorMessage).toContain("timed out after 1ms");
  });

  it("keeps an auto run open after HTTP 202 until the callback succeeds", async () => {
    let payload: Record<string, unknown> | null = null;
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 202 });
    });

    const pending = execute({
      runId: "run-202",
      agent,
      runtime,
      config: {
        url: "https://example.test/webhook",
        callbackBaseUrl: "https://paperclip.test/api/",
        timeoutSec: 30,
      },
      context: {},
      onLog: async () => {},
    });
    const gate = await staysPending(pending);
    expect(gate.settled).toBe(false);

    const callback = (payload as Record<string, unknown> | null)?.paperclipCallback as Record<string, unknown>;
    expect(callback).toMatchObject({
      runId: "run-202",
      url: "https://paperclip.test/api/runs/run-202/complete",
      method: "POST",
      auth: "bearer",
      timeoutSec: 30,
    });
    expect(typeof callback.token).toBe("string");
    expect(String(callback.token).length).toBeGreaterThan(20);

    const completed = completeAsyncHttpRun({
      runId: "run-202",
      token: String(callback.token),
      status: "succeeded",
      summary: "async agent finished",
    });
    expect(completed).toEqual({ ok: true });

    const result = await gate.tracked;
    expect(result).toMatchObject({
      exitCode: 0,
      timedOut: false,
      summary: "async agent finished",
    });
  });

  it("treats a JSON async flag as a deferred 200", async () => {
    let token = "";
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { paperclipCallback?: { token?: string } };
      token = body.paperclipCallback?.token ?? "";
      return jsonResponse(200, { async: true });
    });

    const pending = execute({
      runId: "run-flag",
      agent,
      runtime,
      config: { url: "https://example.test/webhook", responseMode: "auto" },
      context: {},
      onLog: async () => {},
    });
    const gate = await staysPending(pending);
    expect(gate.settled).toBe(false);
    completeAsyncHttpRun({
      runId: "run-flag",
      token,
      status: "failed",
      summary: "remote rejected the task",
    });
    await expect(gate.tracked).resolves.toMatchObject({
      exitCode: 1,
      errorMessage: "remote rejected the task",
      summary: "remote rejected the task",
    });
  });

  it("waits for any 2xx when responseMode is async", async () => {
    let token = "";
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { paperclipCallback?: { token?: string } };
      token = body.paperclipCallback?.token ?? "";
      return jsonResponse(200, { ok: true });
    });

    const pending = execute({
      runId: "run-async-mode",
      agent,
      runtime,
      config: { url: "https://example.test/webhook", responseMode: "async" },
      context: {},
      onLog: async () => {},
    });
    const gate = await staysPending(pending);
    expect(gate.settled).toBe(false);
    completeAsyncHttpRun({ runId: "run-async-mode", token, status: "succeeded" });
    await expect(gate.tracked).resolves.toMatchObject({
      exitCode: 0,
      summary: "HTTP POST https://example.test/webhook",
    });
  });

  it("closes a sync run immediately and omits the callback", async () => {
    guardedFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.paperclipCallback).toBeUndefined();
      return new Response(JSON.stringify({ async: true }), { status: 202 });
    });

    const result = await execute({
      runId: "run-sync",
      agent,
      runtime,
      config: { url: "https://example.test/webhook", responseMode: "sync" },
      context: {},
      onLog: async () => {},
    });
    expect(result).toMatchObject({
      exitCode: 0,
      timedOut: false,
      summary: "HTTP POST https://example.test/webhook",
    });
  });

  it("fails an accepted async run when the callback deadline passes", async () => {
    guardedFetchMock.mockImplementation(async () => new Response(null, { status: 202 }));

    const result = await execute({
      runId: "run-timeout",
      agent,
      runtime,
      config: { url: "https://example.test/webhook", timeoutMs: 30 },
      context: {},
      onLog: async () => {},
    });

    expect(result.timedOut).toBe(true);
    expect(result.errorCode).toBe("timeout");
    expect(result.errorMessage).toContain("timed out after 30ms");
  });

  it("builds a relative completion path when no origin is configured", () => {
    const previous = process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_API_URL;
    try {
      expect(httpRunCompleteUrl("run-1", {})).toBe("/api/runs/run-1/complete");
    } finally {
      if (previous === undefined) delete process.env.PAPERCLIP_API_URL;
      else process.env.PAPERCLIP_API_URL = previous;
    }
  });
});
