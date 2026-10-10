import { describe, expect, it } from "vitest";
import { getConfigSchema } from "./config-schema.js";

describe("grok_bot config schema", () => {
  it("marks the webhook key as a secret and defaults to async", () => {
    const fields = getConfigSchema().fields;
    expect(fields.map((field) => field.key)).toEqual([
      "webhookUrl",
      "webhookKey",
      "webhookAuth",
      "contextBlock",
      "callbackBaseUrl",
      "responseMode",
      "timeoutSec",
    ]);
    expect(fields.find((field) => field.key === "webhookKey")?.meta).toMatchObject({ secret: true });
    expect(fields.find((field) => field.key === "responseMode")?.default).toBe("async");
    expect(fields.find((field) => field.key === "webhookAuth")?.default).toBe("bearer");
  });
});
