import { afterEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_INTENT_AGENT_GUIDANCE } from "@paperclipai/shared";
import { execute } from "./execute.js";

const guardedFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./remote-fetch.js", () => ({
  guardedHttpAdapterFetch: guardedFetchMock,
}));

afterEach(() => {
  guardedFetchMock.mockReset();
});

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

  it("honors timeoutSec and still accepts legacy timeoutMs", async () => {
    guardedFetchMock.mockImplementation(
      (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );

    const result = await execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "company-1", name: "Agent", adapterType: "http", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { url: "https://example.test/webhook", timeoutSec: 0.001, timeoutMs: 5_000 },
      context: {},
      onLog: async () => {},
    });

    expect(result.timedOut).toBe(true);
    expect(result.errorMessage).toContain("timed out after 1ms");
  });

  it("sends the configured method and resolved string headers", async () => {
    guardedFetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "company-1", name: "Agent", adapterType: "http", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: {
        url: "https://example.test/webhook",
        method: "put",
        headers: { "X-Trace": "1" },
        timeoutSec: 0,
      },
      context: {},
      onLog: async () => {},
    });

    expect(guardedFetchMock).toHaveBeenCalledWith(
      "https://example.test/webhook",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "X-Trace": "1",
        }),
      }),
    );
    const init = guardedFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });

  it("refuses to send an unresolved header secret reference", async () => {
    await expect(execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "company-1", name: "Agent", adapterType: "http", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: {
        url: "https://example.test/webhook",
        headers: {
          Authorization: { type: "secret_ref", secretId: "11111111-1111-4111-8111-111111111111", version: "latest" },
        },
      },
      context: {},
      onLog: async () => {},
    })).rejects.toThrow(/Authorization/);
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });
});
