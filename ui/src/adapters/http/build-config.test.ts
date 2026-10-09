import { describe, expect, it } from "vitest";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { HTTP_ADAPTER_FORM_FIELDS } from "./fields";
import { buildHttpConfig } from "./build-config";
import { normalizeHttpHeaders } from "./headers";

const secretId = "11111111-1111-4111-8111-111111111111";

function values(patch: Partial<CreateConfigValues>): CreateConfigValues {
  return patch as CreateConfigValues;
}

describe("http adapter form config", () => {
  it("matches the server config fields and leaves room for another field", () => {
    expect(HTTP_ADAPTER_FORM_FIELDS.map((field) => field.key)).toEqual([
      "url",
      "method",
      "headers",
      "timeoutSec",
    ]);
    expect(HTTP_ADAPTER_FORM_FIELDS.find((field) => field.key === "timeoutSec")?.section).toBe("runPolicy");
  });

  it("builds url, method, header secret refs, and timeoutSec", () => {
    expect(buildHttpConfig(values({
      url: "https://example.test/hook",
      timeoutSec: 12,
      adapterSchemaValues: {
        method: "put",
        timeoutSec: 12,
        headers: {
          Authorization: { type: "secret_ref", secretId, version: "latest" },
          "X-Trace": "visible",
          "Bad Name": "drop",
        },
        responseMode: "async",
      },
    }))).toEqual({
      url: "https://example.test/hook",
      method: "PUT",
      headers: {
        Authorization: { type: "secret_ref", secretId, version: "latest" },
        "X-Trace": "visible",
      },
      timeoutSec: 12,
      responseMode: "async",
    });
    expect(buildHttpConfig(values({ url: "https://example.test/hook" }))).toMatchObject({
      method: "POST",
      timeoutSec: 0,
    });
    expect(buildHttpConfig(values({ url: "https://example.test/hook" })).timeoutMs).toBeUndefined();
  });

  it("normalizes header secret refs without keeping the secret value", () => {
    expect(normalizeHttpHeaders({
      Authorization: { type: "secret_ref", secretId, version: 3 },
    })).toEqual({
      Authorization: { type: "secret_ref", secretId, version: 3 },
    });
  });
});
