import { createHmac } from "node:crypto";

export const GROK_BOT_SIGNATURE_HEADER = "X-Paperclip-Signature";

export type GrokWebhookAuthMode = "bearer" | "hmac";

export function readGrokWebhookAuthMode(value: unknown): GrokWebhookAuthMode {
  return value === "hmac" ? "hmac" : "bearer";
}

/** Resolved webhook key, or "" when unset. Unresolved secret refs throw. */
export function readResolvedWebhookKey(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  throw new Error(
    "Grok Bot webhookKey is not a resolved string. Store it as a company secret reference.",
  );
}

export function grokWebhookSignature(secret: string, body: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

/**
 * Bearer mode sends `Authorization: Bearer <key>` unless the stored value
 * already includes the scheme. HMAC mode signs the exact request body.
 */
export function applyGrokWebhookAuth(input: {
  headers: Record<string, string>;
  bodyText: string;
  authMode: GrokWebhookAuthMode;
  key: string;
}): Record<string, string> {
  const headers = { ...input.headers };
  const key = input.key.trim();
  if (!key) return headers;
  if (input.authMode === "hmac") {
    headers[GROK_BOT_SIGNATURE_HEADER] = grokWebhookSignature(key, input.bodyText);
    return headers;
  }
  headers.Authorization = /^Bearer\s+/i.test(key) ? key : `Bearer ${key}`;
  return headers;
}
