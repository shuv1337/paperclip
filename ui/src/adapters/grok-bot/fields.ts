import type { AdapterConfigSection } from "../types";

export type GrokBotFormField = {
  key: string;
  label: string;
  hint: string;
  section: AdapterConfigSection;
  kind: "text" | "select" | "number" | "textarea" | "secret";
  placeholder?: string;
  defaultValue?: string | number;
  options?: readonly { value: string; label: string }[];
};

/**
 * Board fields for the Grok Bot adapter. Webhook auth and the async response
 * mode follow the HTTP adapter: the key is a company secret reference, and
 * async keeps the run open until the callback.
 */
export const GROK_BOT_FORM_FIELDS: readonly GrokBotFormField[] = [
  {
    key: "webhookUrl",
    label: "Webhook URL",
    hint: "Absolute http(s) URL of the Grok Bot webhook. Paperclip POSTs a wake payload here.",
    section: "configuration",
    kind: "text",
    placeholder: "https://bot.example/webhook",
  },
  {
    key: "webhookKey",
    label: "Webhook key",
    hint: "Shared secret. Stored as a company secret. Bearer mode sends Authorization: Bearer <key>.",
    section: "configuration",
    kind: "secret",
  },
  {
    key: "webhookAuth",
    label: "Webhook auth",
    hint: "Bearer adds the scheme when the secret is a raw key. HMAC sets X-Paperclip-Signature over the raw JSON body.",
    section: "configuration",
    kind: "select",
    defaultValue: "bearer",
    options: [
      { value: "bearer", label: "Bearer header" },
      { value: "hmac", label: "HMAC signature" },
    ],
  },
  {
    key: "contextBlock",
    label: "Context block",
    hint: "Optional text included in every wake payload, beside the issue title, description, and recent comments.",
    section: "configuration",
    kind: "textarea",
    placeholder: "Standing instructions for this bot",
  },
  {
    key: "callbackBaseUrl",
    label: "Callback base URL",
    hint: "Optional Paperclip origin the bot can reach. Defaults to PAPERCLIP_API_URL.",
    section: "configuration",
    kind: "text",
    placeholder: "https://paperclip.example",
  },
  {
    key: "responseMode",
    label: "Response mode",
    hint: "Async keeps the run open after any 2xx until the callback or timeout.",
    section: "runPolicy",
    kind: "select",
    defaultValue: "async",
    options: [
      { value: "async", label: "Async" },
      { value: "auto", label: "Auto" },
      { value: "sync", label: "Sync" },
    ],
  },
  {
    key: "timeoutSec",
    label: "Timeout seconds",
    hint: "Seconds to wait for the webhook and the completion callback. 0 waits until the callback or cancellation.",
    section: "runPolicy",
    kind: "number",
    defaultValue: 0,
  },
];
