import { describe, expect, it } from "vitest";
import { getConfigSchema } from "./config-schema.js";
import {
  canonicalHttpHeaders,
  planHttpHeaders,
  requireHttpRequestHeaders,
} from "./headers.js";
import { resolveHttpTimeoutMs } from "./timeout.js";

const secretId = "11111111-1111-4111-8111-111111111111";

describe("http adapter config", () => {
  it("publishes url, method, headers, and timeoutSec", () => {
    expect(getConfigSchema().fields.map((field) => field.key)).toEqual([
      "url",
      "method",
      "headers",
      "timeoutSec",
    ]);
    expect(getConfigSchema().fields.find((field) => field.key === "headers")?.meta).toMatchObject({
      secretRefs: true,
    });
  });

  it("plans header secret refs separately from plain values", () => {
    expect(planHttpHeaders({
      Authorization: { type: "secret_ref", secretId, version: "latest" },
      "X-Trace": "visible",
    })).toEqual([
      expect.objectContaining({
        name: "Authorization",
        kind: "secret_ref",
        ref: expect.objectContaining({ configPath: "headers.Authorization", secretId }),
      }),
      { name: "X-Trace", kind: "plain", value: "visible" },
    ]);
  });

  it("rejects a malformed secret reference and keeps plain headers sendable", () => {
    expect(canonicalHttpHeaders({
      Authorization: { type: "secret_ref", secretId: "not-a-uuid" },
    })).toEqual({ error: "Invalid HTTP header secret reference: Authorization" });
    expect(requireHttpRequestHeaders({ "X-Trace": "visible" })).toEqual({ "X-Trace": "visible" });
    expect(() => requireHttpRequestHeaders({
      Authorization: { type: "secret_ref", secretId, version: "latest" },
    })).toThrow(/Authorization/);
  });

  it("uses timeoutSec and falls back to timeoutMs", () => {
    expect(resolveHttpTimeoutMs({ timeoutSec: 2 })).toBe(2000);
    expect(resolveHttpTimeoutMs({ timeoutSec: 0, timeoutMs: 1500 })).toBe(0);
    expect(resolveHttpTimeoutMs({ timeoutMs: 1500 })).toBe(1500);
    expect(resolveHttpTimeoutMs({})).toBe(0);
  });
});
