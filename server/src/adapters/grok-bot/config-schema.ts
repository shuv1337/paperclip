import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        type: "text",
        required: true,
        hint: "Absolute http(s) URL of the Grok Bot webhook. Paperclip POSTs a wake payload here.",
      },
      {
        key: "webhookKey",
        label: "Webhook key",
        type: "text",
        required: true,
        hint: "Shared secret. Stored as a company secret reference. Bearer mode sends Authorization: Bearer <key>. HMAC mode signs the body.",
        meta: { secret: true },
      },
      {
        key: "webhookAuth",
        label: "Webhook auth",
        type: "select",
        default: "bearer",
        options: [
          { value: "bearer", label: "Bearer header" },
          { value: "hmac", label: "HMAC signature" },
        ],
        hint: "Bearer adds the scheme when the secret is a raw key. HMAC sets X-Paperclip-Signature: sha256=<hex> over the raw JSON body.",
      },
      {
        key: "contextBlock",
        label: "Context block",
        type: "textarea",
        hint: "Optional text included in every wake payload as contextBlock, beside the issue snapshot.",
      },
      {
        key: "callbackBaseUrl",
        label: "Callback base URL",
        type: "text",
        hint: "Optional Paperclip origin the bot can reach. Defaults to PAPERCLIP_API_URL.",
      },
      {
        key: "responseMode",
        label: "Response mode",
        type: "select",
        default: "async",
        options: [
          { value: "async", label: "Async" },
          { value: "auto", label: "Auto" },
          { value: "sync", label: "Sync" },
        ],
        hint: "Async keeps the run open after any 2xx until the callback or timeout. Auto waits only for HTTP 202 or {\"async\":true}. Sync closes on 2xx.",
      },
      {
        key: "timeoutSec",
        label: "Timeout seconds",
        type: "number",
        default: 0,
        hint: "Seconds to wait for the webhook and, in async mode, the completion callback. 0 waits until the callback or cancellation.",
      },
    ],
  };
}
