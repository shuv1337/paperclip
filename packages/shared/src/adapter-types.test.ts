import { describe, expect, it } from "vitest";
import {
  AGENT_ADAPTER_TYPES,
  AGENT_ROLE_LABELS,
  acceptInviteSchema,
  agentJoinAdapterTypeRequiredMessage,
  createAgentSchema,
  resolveAgentJoinRequestAdapterType,
  updateAgentSchema,
} from "./index.js";

describe("dynamic adapter type validation schemas", () => {
  it("accepts external adapter types in create/update agent schemas", () => {
    expect(
      createAgentSchema.parse({
        name: "External Agent",
        adapterType: "external_adapter",
      }).adapterType,
    ).toBe("external_adapter");

    expect(
      updateAgentSchema.parse({
        adapterType: "external_adapter",
      }).adapterType,
    ).toBe("external_adapter");
  });

  it("still rejects blank adapter types", () => {
    expect(() =>
      createAgentSchema.parse({
        name: "Blank Adapter",
        adapterType: "   ",
      }),
    ).toThrow();
  });

  it("accepts an explicit managed instructions bundle for new agents", () => {
    expect(
      createAgentSchema.parse({
        name: "Bundle Agent",
        adapterType: "codex_local",
        instructionsBundle: {
          files: {
            "AGENTS.md": "Use AGENTS.md.",
          },
        },
      }).instructionsBundle?.files["AGENTS.md"],
    ).toBe("Use AGENTS.md.");
  });

  it("accepts external adapter types in invite acceptance schema", () => {
    expect(
      acceptInviteSchema.parse({
        requestType: "agent",
        agentName: "External Joiner",
        adapterType: "external_adapter",
      }).adapterType,
    ).toBe("external_adapter");
  });

  it("defaults omitted adapterType to process for direct agent create", () => {
    expect(createAgentSchema.parse({ name: "Local Agent" }).adapterType).toBe("process");
  });

  it("requires adapterType for a new agent join request that cannot be inferred", () => {
    const resolution = resolveAgentJoinRequestAdapterType({
      agentDefaultsPayload: { command: "echo hello" },
    });

    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.message).toBe(agentJoinAdapterTypeRequiredMessage());
    expect(resolution.message).toContain("Valid types:");
    expect(resolution.validAdapterTypes).toEqual(AGENT_ADAPTER_TYPES);
    for (const adapterType of AGENT_ADAPTER_TYPES) {
      expect(resolution.message).toContain(adapterType);
    }
  });

  it("infers http from url, openclaw from a websocket url, and hermes from apiBaseUrl", () => {
    expect(
      resolveAgentJoinRequestAdapterType({
        agentDefaultsPayload: { url: " https://agent.example/hook " },
      }),
    ).toEqual({ ok: true, adapterType: "http", source: "inferred" });

    expect(
      resolveAgentJoinRequestAdapterType({
        agentDefaultsPayload: { url: "wss://gateway.example" },
      }),
    ).toEqual({ ok: true, adapterType: "openclaw_gateway", source: "inferred" });

    expect(
      resolveAgentJoinRequestAdapterType({
        agentDefaultsPayload: { apiBaseUrl: "http://127.0.0.1:8642" },
      }),
    ).toEqual({ ok: true, adapterType: "hermes_gateway", source: "inferred" });
  });

  it("keeps an explicit adapterType, including process and external types", () => {
    expect(
      resolveAgentJoinRequestAdapterType({
        adapterType: " process ",
        agentDefaultsPayload: { url: "https://agent.example/hook" },
      }),
    ).toEqual({ ok: true, adapterType: "process", source: "explicit" });

    expect(
      resolveAgentJoinRequestAdapterType({
        adapterType: "external_adapter",
      }),
    ).toEqual({ ok: true, adapterType: "external_adapter", source: "explicit" });
  });

  it("uses process only as a legacy fallback when a stored join request cannot be inferred", () => {
    expect(
      resolveAgentJoinRequestAdapterType({
        adapterType: null,
        agentDefaultsPayload: null,
        allowLegacyProcessFallback: true,
      }),
    ).toEqual({ ok: true, adapterType: "process", source: "legacy" });

    expect(
      resolveAgentJoinRequestAdapterType({
        adapterType: null,
        agentDefaultsPayload: { url: "https://agent.example/hook" },
        allowLegacyProcessFallback: true,
      }),
    ).toEqual({ ok: true, adapterType: "http", source: "inferred" });
  });

  it("accepts the security agent role and exposes its UI label", () => {
    expect(
      createAgentSchema.parse({
        name: "Security Engineer",
        role: "security",
        adapterType: "codex_local",
      }).role,
    ).toBe("security");

    expect(AGENT_ROLE_LABELS.security).toBe("Security");
  });
});
