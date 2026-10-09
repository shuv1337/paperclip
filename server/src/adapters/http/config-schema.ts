import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";

const HTTP_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE", "HEAD"] as const;

/**
 * Declarative HTTP adapter fields. Append a field when the adapter grows
 * (for example an async response mode) and mirror it in the board form.
 */
export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "url",
        label: "Webhook URL",
        type: "text",
        required: true,
        hint: "Absolute http(s) URL Paperclip calls when this agent runs.",
      },
      {
        key: "method",
        label: "Method",
        type: "select",
        default: "POST",
        options: HTTP_METHODS.map((method) => ({ value: method, label: method })),
        hint: "HTTP method used to invoke the endpoint.",
      },
      {
        key: "headers",
        label: "Headers",
        type: "textarea",
        hint: "Header map. Values are plain strings or company secret references ({ type: \"secret_ref\", secretId, version }).",
        meta: { secretRefs: true, valueShape: "headerMap" },
      },
      {
        key: "timeoutSec",
        label: "Timeout seconds",
        type: "number",
        default: 0,
        hint: "Maximum seconds to wait for the endpoint. 0 means no timeout.",
      },
    ],
  };
}
