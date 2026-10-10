import {
  envBindingSchema,
  type EnvBinding,
  type SecretProjectionClass,
  type SecretVersionSelector,
} from "@paperclipai/shared";

/** RFC 7230 token. Header names such as `X-Api-Key` are valid. */
export const HTTP_HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function httpHeaderConfigPath(name: string): string {
  return `headers.${name}`;
}

export interface HttpHeaderSecretRef {
  name: string;
  configPath: string;
  secretId: string;
  version: SecretVersionSelector;
  projectionClass?: SecretProjectionClass;
  projectionAllowlistKey?: string | null;
}

export interface HttpHeaderUserSecretRef {
  name: string;
  configPath: string;
  definitionKey: string;
  version: SecretVersionSelector;
  required: boolean;
  allowMissingOverride: boolean;
}

export type HttpHeaderPlanEntry =
  | { name: string; kind: "plain"; value: string }
  | { name: string; kind: "secret_ref"; ref: HttpHeaderSecretRef }
  | { name: string; kind: "user_secret_ref"; ref: HttpHeaderUserSecretRef }
  | { name: string; kind: "invalid_secret_ref" }
  | { name: string; kind: "passthrough"; value: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeBinding(value: unknown): boolean {
  return isRecord(value) && (
    value.type === "secret_ref" ||
    value.type === "user_secret_ref" ||
    value.type === "plain"
  );
}

function planBinding(name: string, binding: EnvBinding): HttpHeaderPlanEntry {
  if (typeof binding === "string" || binding.type === "plain") {
    return { name, kind: "plain", value: typeof binding === "string" ? binding : binding.value };
  }
  if (binding.type === "secret_ref") {
    return {
      name,
      kind: "secret_ref",
      ref: {
        name,
        configPath: httpHeaderConfigPath(name),
        secretId: binding.secretId,
        version: binding.version ?? "latest",
        projectionClass: binding.projectionClass,
        projectionAllowlistKey: binding.projectionAllowlistKey ?? null,
      },
    };
  }
  return {
    name,
    kind: "user_secret_ref",
    ref: {
      name,
      configPath: httpHeaderConfigPath(name),
      definitionKey: binding.key,
      version: binding.version ?? "latest",
      required: binding.required ?? true,
      allowMissingOverride: binding.allowMissingOverride ?? false,
    },
  };
}

function planOne(name: string, rawValue: unknown): HttpHeaderPlanEntry {
  const bindingShaped = looksLikeBinding(rawValue);
  if (!HTTP_HEADER_NAME_RE.test(name)) {
    return bindingShaped
      ? { name, kind: "invalid_secret_ref" }
      : { name, kind: "passthrough", value: rawValue };
  }
  if (typeof rawValue === "string") return { name, kind: "plain", value: rawValue };
  if (!bindingShaped) return { name, kind: "passthrough", value: rawValue };
  const parsed = envBindingSchema.safeParse(rawValue);
  if (!parsed.success) return { name, kind: "invalid_secret_ref" };
  return planBinding(name, parsed.data);
}

/** Null when `headers` is not an object. Callers leave non-objects unchanged. */
export function planHttpHeaders(headers: unknown): HttpHeaderPlanEntry[] | null {
  if (!isRecord(headers)) return null;
  const entries: HttpHeaderPlanEntry[] = [];
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim();
    if (!name) continue;
    entries.push(planOne(name, rawValue));
  }
  return entries;
}

export function canonicalHttpHeaders(
  headers: unknown,
): { headers: Record<string, unknown> } | { error: string } | null {
  const plan = planHttpHeaders(headers);
  if (!plan) return null;
  const invalid = plan.find((entry) => entry.kind === "invalid_secret_ref");
  if (invalid) return { error: `Invalid HTTP header secret reference: ${invalid.name}` };

  const next: Record<string, unknown> = {};
  for (const entry of plan) {
    if (entry.kind === "plain") {
      next[entry.name] = entry.value;
      continue;
    }
    if (entry.kind === "secret_ref") {
      next[entry.name] = {
        type: "secret_ref",
        secretId: entry.ref.secretId,
        version: entry.ref.version,
        ...(entry.ref.projectionClass ? { projectionClass: entry.ref.projectionClass } : {}),
        ...(entry.ref.projectionAllowlistKey
          ? { projectionAllowlistKey: entry.ref.projectionAllowlistKey }
          : {}),
      };
      continue;
    }
    if (entry.kind === "user_secret_ref") {
      next[entry.name] = {
        type: "user_secret_ref",
        key: entry.ref.definitionKey,
        version: entry.ref.version,
        required: entry.ref.required,
        allowMissingOverride: entry.ref.allowMissingOverride,
      };
      continue;
    }
    if (entry.kind === "passthrough") {
      next[entry.name] = entry.value;
    }
  }
  return { headers: next };
}

/** Headers ready for `fetch`. Secret references must already be resolved. */
export function requireHttpRequestHeaders(headers: unknown): Record<string, string> {
  if (headers == null) return {};
  const plan = planHttpHeaders(headers);
  if (!plan) throw new Error("HTTP adapter headers must be an object");
  const requestHeaders: Record<string, string> = {};
  for (const entry of plan) {
    if (entry.kind === "plain") {
      requestHeaders[entry.name] = entry.value;
      continue;
    }
    if (entry.kind === "passthrough" && typeof entry.value === "string") {
      requestHeaders[entry.name] = entry.value;
      continue;
    }
    throw new Error(
      `HTTP adapter header "${entry.name}" is not a resolved string. Use a plain string or a secret reference.`,
    );
  }
  return requestHeaders;
}
