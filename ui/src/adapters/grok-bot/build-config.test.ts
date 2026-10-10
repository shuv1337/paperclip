import { describe, expect, it } from "vitest";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { GROK_BOT_FORM_FIELDS } from "./fields";
import { buildGrokBotConfig } from "./build-config";

const secretId = "11111111-1111-4111-8111-111111111111";

function values(patch: Partial<CreateConfigValues>): CreateConfigValues {
  return patch as CreateConfigValues;
}

describe("grok bot form config", () => {
  it("matches the server fields and defaults to async bearer auth", () => {
    expect(GROK_BOT_FORM_FIELDS.map((field) => field.key)).toEqual([
      "webhookUrl",
      "webhookKey",
      "webhookAuth",
      "contextBlock",
      "callbackBaseUrl",
      "responseMode",
      "timeoutSec",
    ]);
    expect(GROK_BOT_FORM_FIELDS.find((field) => field.key === "timeoutSec")?.section).toBe("runPolicy");
    expect(GROK_BOT_FORM_FIELDS.find((field) => field.key === "responseMode")?.section).toBe("runPolicy");
    expect(buildGrokBotConfig(values({
      adapterSchemaValues: { webhookUrl: "https://bot.example/hook" },
    }))).toMatchObject({
      webhookUrl: "https://bot.example/hook",
      webhookAuth: "bearer",
      responseMode: "async",
      timeoutSec: 0,
    });
  });

  it("stores the webhook key as a secret reference and keeps async settings", () => {
    expect(buildGrokBotConfig(values({
      timeoutSec: 90,
      adapterSchemaValues: {
        webhookUrl: " https://bot.example/hook ",
        webhookKey: { type: "secret_ref", secretId, version: "latest" },
        webhookAuth: "hmac",
        contextBlock: "  Look at the issue title first. ",
        callbackBaseUrl: "https://paperclip.example",
        responseMode: "async",
        timeoutSec: 90,
      },
    }))).toEqual({
      webhookUrl: "https://bot.example/hook",
      webhookKey: { type: "secret_ref", secretId, version: "latest" },
      webhookAuth: "hmac",
      contextBlock: "Look at the issue title first.",
      callbackBaseUrl: "https://paperclip.example",
      responseMode: "async",
      timeoutSec: 90,
    });
  });
});
