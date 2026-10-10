import { envBindingSchema, type SecretProjectionClass, type SecretVersionSelector } from "@paperclipai/shared";
import { planHttpHeaders } from "../adapters/http/headers.js";

interface AgentSecretBindingSyncService {
  syncSecretRefsForTarget?: (
    companyId: string,
    target: { targetType: "agent"; targetId: string },
    refs: Array<{
      secretId: string;
      configPath: string;
      versionSelector?: SecretVersionSelector;
      required?: boolean;
      label?: string | null;
      projectionClass?: SecretProjectionClass;
      projectionAllowlistKey?: string | null;
    }>,
    options?: { replaceAll?: boolean },
  ) => Promise<unknown>;
  syncEnvBindingsForTarget?: (
    companyId: string,
    target: { targetType: "agent"; targetId: string; pathPrefix?: string },
    envValue: unknown,
  ) => Promise<unknown>;
  syncUserSecretDeclarationsForTarget?: (
    companyId: string,
    target: { targetType: "agent"; targetId: string; pathPrefix?: string },
    refs: Array<{
      definitionKey: string;
      configPath: string;
      envKey: string;
      versionSelector?: SecretVersionSelector;
      required?: boolean;
      allowMissingOverride?: boolean;
      label?: string | null;
    }>,
    options?: { replaceAll?: boolean },
  ) => Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function collectSecretRefs(adapterConfig: unknown): Array<{
  secretId: string;
  configPath: string;
  versionSelector?: SecretVersionSelector;
  projectionClass?: SecretProjectionClass;
  projectionAllowlistKey?: string | null;
}> {
  const config = asRecord(adapterConfig);
  if (!config) return [];
  const refs: Array<{
    secretId: string;
    configPath: string;
    versionSelector?: SecretVersionSelector;
    projectionClass?: SecretProjectionClass;
    projectionAllowlistKey?: string | null;
  }> = [];

  const envValue = asRecord(config.env);
  for (const [key, rawBinding] of Object.entries(envValue ?? {})) {
    const parsed = envBindingSchema.safeParse(rawBinding);
    if (!parsed.success) continue;
    const binding = parsed.data;
    if (typeof binding !== "object" || binding === null || binding.type !== "secret_ref") continue;
    refs.push({
      secretId: binding.secretId,
      configPath: `env.${key}`,
      versionSelector: binding.version ?? "latest",
      projectionClass: binding.projectionClass,
      projectionAllowlistKey: binding.projectionAllowlistKey ?? null,
    });
  }

  for (const entry of planHttpHeaders(config.headers) ?? []) {
    if (entry.kind !== "secret_ref") continue;
    refs.push({
      secretId: entry.ref.secretId,
      configPath: entry.ref.configPath,
      versionSelector: entry.ref.version,
      projectionClass: entry.ref.projectionClass,
      projectionAllowlistKey: entry.ref.projectionAllowlistKey ?? null,
    });
  }

  for (const [key, rawBinding] of Object.entries(config)) {
    if (key === "env" || key === "headers") continue;
    const parsed = envBindingSchema.safeParse(rawBinding);
    if (!parsed.success) continue;
    const binding = parsed.data;
    if (typeof binding !== "object" || binding === null || binding.type !== "secret_ref") continue;
    refs.push({
      secretId: binding.secretId,
      configPath: key,
      versionSelector: binding.version ?? "latest",
      projectionClass: binding.projectionClass,
      projectionAllowlistKey: binding.projectionAllowlistKey ?? null,
    });
  }

  return refs;
}

export function collectUserSecretRefs(adapterConfig: unknown): Array<{
  definitionKey: string;
  configPath: string;
  envKey: string;
  versionSelector?: SecretVersionSelector;
  required?: boolean;
  allowMissingOverride?: boolean;
}> {
  const config = asRecord(adapterConfig);
  if (!config) return [];
  const refs: Array<{
    definitionKey: string;
    configPath: string;
    envKey: string;
    versionSelector?: SecretVersionSelector;
    required?: boolean;
    allowMissingOverride?: boolean;
  }> = [];

  const envValue = asRecord(config.env);
  for (const [key, rawBinding] of Object.entries(envValue ?? {})) {
    const parsed = envBindingSchema.safeParse(rawBinding);
    if (!parsed.success) continue;
    const binding = parsed.data;
    if (typeof binding !== "object" || binding === null || binding.type !== "user_secret_ref") continue;
    refs.push({
      definitionKey: binding.key,
      configPath: `env.${key}`,
      envKey: key,
      versionSelector: binding.version ?? "latest",
      required: binding.required ?? true,
      allowMissingOverride: binding.allowMissingOverride ?? false,
    });
  }

  for (const entry of planHttpHeaders(config.headers) ?? []) {
    if (entry.kind !== "user_secret_ref") continue;
    refs.push({
      definitionKey: entry.ref.definitionKey,
      configPath: entry.ref.configPath,
      envKey: entry.ref.name,
      versionSelector: entry.ref.version,
      required: entry.ref.required,
      allowMissingOverride: entry.ref.allowMissingOverride,
    });
  }

  for (const [key, rawBinding] of Object.entries(config)) {
    if (key === "env" || key === "headers") continue;
    const parsed = envBindingSchema.safeParse(rawBinding);
    if (!parsed.success) continue;
    const binding = parsed.data;
    if (typeof binding !== "object" || binding === null || binding.type !== "user_secret_ref") continue;
    refs.push({
      definitionKey: binding.key,
      configPath: key,
      envKey: key,
      versionSelector: binding.version ?? "latest",
      required: binding.required ?? true,
      allowMissingOverride: binding.allowMissingOverride ?? false,
    });
  }

  return refs;
}

export async function syncAgentAdapterEnvBindings(input: {
  secretsSvc: AgentSecretBindingSyncService;
  companyId: string;
  agentId: string;
  adapterConfig: unknown;
}) {
  if (input.secretsSvc.syncSecretRefsForTarget) {
    await input.secretsSvc.syncSecretRefsForTarget(
      input.companyId,
      { targetType: "agent", targetId: input.agentId },
      collectSecretRefs(input.adapterConfig),
      { replaceAll: true },
    );
    await input.secretsSvc.syncUserSecretDeclarationsForTarget?.(
      input.companyId,
      { targetType: "agent", targetId: input.agentId },
      collectUserSecretRefs(input.adapterConfig),
      { replaceAll: true },
    );
    return;
  }
  const envValue = asRecord(asRecord(input.adapterConfig)?.env);
  await input.secretsSvc.syncEnvBindingsForTarget?.(
    input.companyId,
    { targetType: "agent", targetId: input.agentId },
    envValue,
  );
}
