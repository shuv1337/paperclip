import { z } from "zod";
import { AGENT_ADAPTER_TYPES } from "./constants.js";

// Direct agent create still defaults an omitted adapterType to "process".
// Agent join requests must not use this default. Resolve those with
// resolveAgentJoinRequestAdapterType so a missing type is inferred or rejected.
export const agentAdapterTypeSchema = z
  .string()
  .trim()
  .min(1)
  .default("process")
  .describe(`Known built-in adapters: ${AGENT_ADAPTER_TYPES.join(", ")}. External adapters may register additional non-empty string types at runtime.`);

export const optionalAgentAdapterTypeSchema = z
  .string()
  .trim()
  .min(1)
  .optional();

const WEBSOCKET_URL = /^wss?:\/\//i;

export type AgentJoinAdapterTypeSource = "explicit" | "inferred" | "legacy";

export type AgentJoinAdapterTypeResolution =
  | { ok: true; adapterType: string; source: AgentJoinAdapterTypeSource }
  | { ok: false; message: string; validAdapterTypes: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Infer an adapter type from a join-request payload.
 * webhookUrl infers grok_bot. A websocket url infers openclaw_gateway.
 * Any other url infers http. apiBaseUrl infers hermes_gateway.
 * Process is never inferred.
 */
export function inferAdapterTypeFromAgentDefaultsPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (readTrimmedString(payload.webhookUrl)) return "grok_bot";
  const url = readTrimmedString(payload.url);
  if (url) {
    if (WEBSOCKET_URL.test(url)) return "openclaw_gateway";
    return "http";
  }
  if (readTrimmedString(payload.apiBaseUrl)) return "hermes_gateway";
  return null;
}

export function agentJoinAdapterTypeRequiredMessage(
  validAdapterTypes: readonly string[] = AGENT_ADAPTER_TYPES,
): string {
  return `adapterType is required for agent join requests. Valid types: ${validAdapterTypes.join(", ")}.`;
}

/**
 * Resolve the adapter type for an agent join request.
 * Explicit types win, including types outside the built-in list.
 * Otherwise infer from agentDefaultsPayload.
 * New requests fail closed when neither is available.
 * Approval of rows created before this rule may set allowLegacyProcessFallback.
 */
export function resolveAgentJoinRequestAdapterType(input: {
  adapterType?: string | null;
  agentDefaultsPayload?: unknown;
  allowLegacyProcessFallback?: boolean;
}): AgentJoinAdapterTypeResolution {
  const explicit = readTrimmedString(input.adapterType);
  if (explicit) {
    return { ok: true, adapterType: explicit, source: "explicit" };
  }

  const inferred = inferAdapterTypeFromAgentDefaultsPayload(input.agentDefaultsPayload);
  if (inferred) {
    return { ok: true, adapterType: inferred, source: "inferred" };
  }

  if (input.allowLegacyProcessFallback) {
    return { ok: true, adapterType: "process", source: "legacy" };
  }

  return {
    ok: false,
    message: agentJoinAdapterTypeRequiredMessage(),
    validAdapterTypes: AGENT_ADAPTER_TYPES,
  };
}
