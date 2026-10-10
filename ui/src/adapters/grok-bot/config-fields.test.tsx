// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AdapterConfigFieldsProps, AdapterConfigSection } from "../types";
import { GrokBotConfigFields } from "./config-fields";

vi.mock("../../components/SecretBindingPicker", () => ({
  SecretBindingPicker: ({ value }: { value: { secretId?: string } | null }) => (
    <div>Secret picker {value?.secretId ?? "empty"}</div>
  ),
}));

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

async function renderSection(section: AdapterConfigSection, config: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: AdapterConfigFieldsProps = {
    mode: "edit",
    isCreate: false,
    adapterType: "grok_bot",
    section,
    values: null,
    set: null,
    config,
    eff: (_group, _key, original) => original,
    mark: vi.fn(),
    models: [],
  };
  await act(async () => {
    root.render(
      <TooltipProvider>
        <GrokBotConfigFields {...props} />
      </TooltipProvider>,
    );
  });
  const html = container.innerHTML;
  await act(async () => root.unmount());
  container.remove();
  return html;
}

describe("GrokBotConfigFields", () => {
  it("shows the webhook fields in configuration and async settings in run policy", async () => {
    const secretId = "11111111-1111-4111-8111-111111111111";
    const config = {
      webhookUrl: "https://bot.example/hook",
      webhookKey: { type: "secret_ref", secretId, version: "latest" },
      webhookAuth: "hmac",
      contextBlock: "Standing note",
      responseMode: "async",
      timeoutSec: 45,
    };
    const configuration = await renderSection("configuration", config);
    const policy = await renderSection("runPolicy", config);

    expect(configuration).toContain("Webhook URL");
    expect(configuration).toContain("https://bot.example/hook");
    expect(configuration).toContain("Webhook key");
    expect(configuration).toContain(`Secret picker ${secretId}`);
    expect(configuration).toContain("Webhook auth");
    expect(configuration).toContain("HMAC signature");
    expect(configuration).toContain("Context block");
    expect(configuration).toContain("Standing note");
    expect(configuration).not.toContain('value="45"');

    expect(policy).toContain("Response mode");
    expect(policy).toContain("Async");
    expect(policy).toContain("Timeout seconds");
    expect(policy).toContain('value="45"');
    expect(policy).not.toContain("Webhook URL");
  });
});
