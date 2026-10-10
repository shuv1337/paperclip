import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { execute as executeHttpWake } from "../http/execute.js";
import { asString } from "../utils.js";
import { applyGrokWebhookAuth, readGrokWebhookAuthMode, readResolvedWebhookKey } from "./auth.js";
import { buildGrokWakeTemplate } from "./payload.js";

function readResponseMode(value: unknown): "sync" | "async" | "auto" {
  const raw = asString(value, "async").trim().toLowerCase();
  if (raw === "sync" || raw === "auto") return raw;
  return "async";
}

export function grokBotHttpConfig(
  config: Record<string, unknown>,
  companyId: string,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const webhookUrl = asString(config.webhookUrl, "").trim() || asString(config.url, "").trim();
  if (!webhookUrl) throw new Error("Grok Bot adapter missing webhookUrl");
  const timeoutSec = config.timeoutSec;
  const callbackBaseUrl = asString(config.callbackBaseUrl, "").trim();
  return {
    url: webhookUrl,
    method: "POST",
    responseMode: readResponseMode(config.responseMode),
    ...(typeof timeoutSec === "number" || typeof timeoutSec === "string" ? { timeoutSec } : {}),
    ...(callbackBaseUrl ? { callbackBaseUrl } : {}),
    payloadTemplate: buildGrokWakeTemplate({ config, companyId, context }),
  };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const authMode = readGrokWebhookAuthMode(ctx.config.webhookAuth);
  const key = readResolvedWebhookKey(ctx.config.webhookKey);
  if (authMode === "hmac" && !key) {
    throw new Error("Grok Bot HMAC auth requires webhookKey");
  }
  const httpConfig = grokBotHttpConfig(ctx.config, ctx.agent.companyId, ctx.context);
  return executeHttpWake(
    { ...ctx, config: httpConfig },
    {
      finalizeHeaders: (bodyText, headers) => applyGrokWebhookAuth({
        headers,
        bodyText,
        authMode,
        key,
      }),
    },
  );
}
