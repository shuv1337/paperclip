import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";
import { asString, parseObject } from "../utils.js";
import { guardedHttpAdapterFetch } from "../http/remote-fetch.js";
import {
  applyGrokWebhookAuth,
  readGrokWebhookAuthMode,
  readResolvedWebhookKey,
} from "./auth.js";
import { grokPaperclipApiUrl } from "./payload.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const urlValue = asString(config.webhookUrl, "").trim() || asString(config.url, "").trim();
  const authMode = readGrokWebhookAuthMode(config.webhookAuth);

  if (!urlValue) {
    checks.push({
      code: "grok_bot_webhook_url_missing",
      level: "error",
      message: "Grok Bot requires a webhook URL.",
      hint: "Set adapterConfig.webhookUrl to an absolute http(s) endpoint.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    checks.push({
      code: "grok_bot_webhook_url_invalid",
      level: "error",
      message: `Invalid webhook URL: ${urlValue}`,
    });
  }

  if (url && url.protocol !== "http:" && url.protocol !== "https:") {
    checks.push({
      code: "grok_bot_webhook_url_protocol_invalid",
      level: "error",
      message: `Unsupported webhook URL protocol: ${url.protocol}`,
      hint: "Use an http:// or https:// endpoint.",
    });
    url = null;
  }

  if (url) {
    checks.push({
      code: "grok_bot_webhook_url_valid",
      level: "info",
      message: `Configured webhook: ${url.toString()}`,
    });
  }

  let key = "";
  try {
    key = readResolvedWebhookKey(config.webhookKey);
  } catch (err) {
    checks.push({
      code: "grok_bot_webhook_key_unresolved",
      level: "error",
      message: err instanceof Error ? err.message : "Webhook key is not resolved",
      hint: "Save the webhook key as a company secret, then test again.",
    });
  }

  if (!key && !checks.some((check) => check.code === "grok_bot_webhook_key_unresolved")) {
    checks.push({
      code: "grok_bot_webhook_key_missing",
      level: "warn",
      message: "No webhook key is configured. The ping is unsigned.",
      hint: "Store a company secret on webhookKey. Bearer mode sends Authorization: Bearer <key>.",
    });
  } else if (key) {
    checks.push({
      code: "grok_bot_webhook_auth_configured",
      level: "info",
      message: authMode === "hmac"
        ? "Ping will use an HMAC signature."
        : "Ping will use a Bearer authorization header.",
    });
  }

  checks.push({
    code: "grok_bot_response_mode",
    level: "info",
    message: `Response mode: ${asString(config.responseMode, "async").trim().toLowerCase() || "async"}`,
  });

  if (url) {
    const bodyText = JSON.stringify({
      kind: "ping",
      adapterType: "grok_bot",
      companyId: ctx.companyId,
      paperclipApiUrl: grokPaperclipApiUrl(config),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await guardedHttpAdapterFetch(url, {
        method: "POST",
        headers: applyGrokWebhookAuth({
          headers: { "content-type": "application/json" },
          bodyText,
          authMode,
          key,
        }),
        body: bodyText,
        signal: controller.signal,
      });
      if (response.ok) {
        checks.push({
          code: "grok_bot_ping_ok",
          level: "info",
          message: `Webhook accepted the test ping with HTTP ${response.status}.`,
        });
      } else {
        checks.push({
          code: "grok_bot_ping_unexpected_status",
          level: "warn",
          message: `Webhook ping returned HTTP ${response.status}.`,
          hint: "Confirm the URL and that the webhook key matches what the bot expects.",
        });
      }
    } catch (err) {
      checks.push({
        code: "grok_bot_ping_failed",
        level: "warn",
        message: err instanceof Error ? err.message : "Webhook ping failed",
        hint: "Confirm Paperclip can reach the webhook. Private hosts need PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
