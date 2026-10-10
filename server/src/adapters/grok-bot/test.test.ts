import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GROK_BOT_SIGNATURE_HEADER } from "./auth.js";
import { testEnvironment } from "./test.js";

const guardedFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../http/remote-fetch.js", () => ({
  guardedHttpAdapterFetch: guardedFetchMock,
}));

afterEach(() => {
  guardedFetchMock.mockReset();
});

describe("grok_bot test connection", () => {
  it("posts a signed ping and reports acceptance", async () => {
    guardedFetchMock.mockImplementation(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://bot.example/hook");
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(JSON.parse(body)).toMatchObject({
        kind: "ping",
        adapterType: "grok_bot",
        companyId: "company-1",
      });
      const headers = init?.headers as Record<string, string>;
      const expected = createHmac("sha256", "ping-secret").update(body).digest("hex");
      expect(headers[GROK_BOT_SIGNATURE_HEADER]).toBe(`sha256=${expected}`);
      expect(headers.Authorization).toBeUndefined();
      return new Response(null, { status: 202 });
    });

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "grok_bot",
      config: {
        webhookUrl: "https://bot.example/hook",
        webhookKey: "ping-secret",
        webhookAuth: "hmac",
      },
    });

    expect(result.status).toBe("pass");
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "grok_bot_ping_ok", level: "info" }),
    ]));
  });

  it("fails closed when the webhook URL is missing", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "grok_bot",
      config: {},
    });
    expect(result.status).toBe("fail");
    expect(result.checks[0]).toMatchObject({ code: "grok_bot_webhook_url_missing", level: "error" });
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });

  it("warns when the ping is reachable but unauthorized", async () => {
    guardedFetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "grok_bot",
      config: {
        webhookUrl: "https://bot.example/hook",
        webhookKey: "wrong",
      },
    });
    expect(result.status).toBe("warn");
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "grok_bot_ping_unexpected_status" }),
    ]));
  });
});
