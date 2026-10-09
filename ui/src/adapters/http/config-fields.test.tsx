// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AdapterConfigFieldsProps, AdapterConfigSection } from "../types";
import { HttpConfigFields } from "./config-fields";

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
    adapterType: "http",
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
        <HttpConfigFields {...props} />
      </TooltipProvider>,
    );
  });
  const html = container.innerHTML;
  await act(async () => root.unmount());
  container.remove();
  return html;
}

describe("HttpConfigFields", () => {
  it("shows url, method, and headers in configuration and timeout in run policy", async () => {
    const config = {
      url: "https://example.test/hook",
      method: "PUT",
      headers: { "X-Trace": "visible" },
      timeoutSec: 37,
    };
    const configuration = await renderSection("configuration", config);
    const policy = await renderSection("runPolicy", config);

    expect(configuration).toContain("Webhook URL");
    expect(configuration).toContain("https://example.test/hook");
    expect(configuration).toContain("Method");
    expect(configuration).toContain("PUT");
    expect(configuration).toContain("Headers");
    expect(configuration).toContain("X-Trace");
    expect(configuration).toContain("Add header");
    expect(configuration).not.toContain('value="37"');

    expect(policy).toContain("Timeout seconds");
    expect(policy).toContain('value="37"');
    expect(policy).not.toContain("Webhook URL");
  });

  it("shows a legacy timeoutMs value as seconds", async () => {
    const policy = await renderSection("runPolicy", { timeoutMs: 2500 });
    expect(policy).toContain('value="2.5"');
  });
});
