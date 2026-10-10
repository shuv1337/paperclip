import type { CreateConfigValues } from "../../components/AgentConfigForm";

function isSecretRef(value: unknown): value is { secretId: string; version?: number | "latest" } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "secret_ref" &&
    typeof (value as { secretId?: unknown }).secretId === "string"
  );
}

export function buildGrokBotConfig(v: CreateConfigValues): Record<string, unknown> {
  const schema: Record<string, unknown> = { ...(v.adapterSchemaValues ?? {}) };
  const ac: Record<string, unknown> = {};
  const webhookUrl = typeof schema.webhookUrl === "string" ? schema.webhookUrl.trim() : "";
  if (webhookUrl) ac.webhookUrl = webhookUrl;

  const webhookKey = schema.webhookKey;
  if (isSecretRef(webhookKey)) {
    ac.webhookKey = {
      type: "secret_ref",
      secretId: webhookKey.secretId,
      version: webhookKey.version ?? "latest",
    };
  } else if (typeof webhookKey === "string" && webhookKey.trim()) {
    ac.webhookKey = webhookKey.trim();
  }

  ac.webhookAuth = schema.webhookAuth === "hmac" ? "hmac" : "bearer";

  const contextBlock = typeof schema.contextBlock === "string" ? schema.contextBlock.trim() : "";
  if (contextBlock) ac.contextBlock = contextBlock;

  const callbackBaseUrl = typeof schema.callbackBaseUrl === "string" ? schema.callbackBaseUrl.trim() : "";
  if (callbackBaseUrl) ac.callbackBaseUrl = callbackBaseUrl;

  const responseMode = schema.responseMode === "sync" || schema.responseMode === "auto"
    ? schema.responseMode
    : "async";
  ac.responseMode = responseMode;

  const timeoutCandidate = typeof schema.timeoutSec === "number"
    ? schema.timeoutSec
    : typeof v.timeoutSec === "number"
      ? v.timeoutSec
      : 0;
  ac.timeoutSec = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0 ? timeoutCandidate : 0;
  return ac;
}
