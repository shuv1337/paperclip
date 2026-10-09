import type { CreateConfigValues } from "../../components/AgentConfigForm";
import { normalizeHttpHeaders } from "./headers";

export function buildHttpConfig(v: CreateConfigValues): Record<string, unknown> {
  const schema: Record<string, unknown> = { ...(v.adapterSchemaValues ?? {}) };
  const ac: Record<string, unknown> = {};
  const url = v.url || (typeof schema.url === "string" ? schema.url : "");
  if (url) ac.url = url;
  delete schema.url;

  const methodValue = typeof schema.method === "string" ? schema.method.trim().toUpperCase() : "";
  ac.method = methodValue || "POST";
  delete schema.method;

  const headers = normalizeHttpHeaders(schema.headers);
  if (headers) ac.headers = headers;
  delete schema.headers;

  const timeoutCandidate = typeof schema.timeoutSec === "number"
    ? schema.timeoutSec
    : typeof v.timeoutSec === "number"
      ? v.timeoutSec
      : 0;
  ac.timeoutSec = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0 ? timeoutCandidate : 0;
  delete schema.timeoutSec;

  // Later fields, such as an async response mode, stay in adapterSchemaValues
  // and are copied here without a dedicated builder branch.
  for (const [key, value] of Object.entries(schema)) {
    if (value !== undefined) ac[key] = value;
  }
  return ac;
}
