import type { AdapterConfigSection } from "../types";

export const HTTP_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE", "HEAD"] as const;

export type HttpAdapterFormField = {
  key: string;
  label: string;
  hint: string;
  section: AdapterConfigSection;
  kind: "text" | "select" | "number" | "secretHeaders";
  placeholder?: string;
  defaultValue?: string | number;
  options?: readonly { value: string; label: string }[];
};

/**
 * Board fields for the HTTP adapter. Append a field when the adapter grows
 * (for example an async response mode). `text`, `select`, and `number` render
 * without a new component. `secretHeaders` is the headers editor.
 * Extra keys are copied into adapterConfig by `buildHttpConfig`.
 */
export const HTTP_ADAPTER_FORM_FIELDS: readonly HttpAdapterFormField[] = [
  {
    key: "url",
    label: "Webhook URL",
    hint: "Absolute http(s) URL Paperclip calls when this agent runs.",
    section: "configuration",
    kind: "text",
    placeholder: "https://...",
  },
  {
    key: "method",
    label: "Method",
    hint: "HTTP method used to invoke the endpoint.",
    section: "configuration",
    kind: "select",
    defaultValue: "POST",
    options: HTTP_METHODS.map((method) => ({ value: method, label: method })),
  },
  {
    key: "headers",
    label: "Headers",
    hint: "Request headers. Use a secret reference for credentials such as Authorization.",
    section: "configuration",
    kind: "secretHeaders",
  },
  {
    key: "timeoutSec",
    label: "Timeout seconds",
    hint: "Maximum seconds to wait for the endpoint. 0 means no timeout.",
    section: "runPolicy",
    kind: "number",
    defaultValue: 0,
  },
];
