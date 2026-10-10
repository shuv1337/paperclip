import { describe, expect, it } from "vitest";
import {
  isEnabledAdapterType,
  isValidAdapterType,
  isVisualAdapterChoice,
  listAdapterOptions,
} from "./metadata";
import type { UIAdapterModule } from "./types";

const externalAdapter: UIAdapterModule = {
  type: "external_test",
  label: "External Test",
  parseStdoutLine: () => [],
  ConfigFields: () => null,
  buildAdapterConfig: () => ({}),
};

describe("adapter metadata", () => {
  it("treats registered external adapters as enabled by default", () => {
    expect(isEnabledAdapterType("external_test")).toBe(true);

    expect(
      listAdapterOptions((type) => type, [externalAdapter]),
    ).toEqual([
      {
        value: "external_test",
        label: "external_test",
        comingSoon: false,
        hidden: false,
        experimental: false,
      },
    ]);
  });

  it("keeps the process adapter withheld and enables http", () => {
    expect(isEnabledAdapterType("process")).toBe(false);
    expect(isValidAdapterType("process")).toBe(false);
    expect(isEnabledAdapterType("http")).toBe(true);
    expect(isValidAdapterType("http")).toBe(true);
    expect(isVisualAdapterChoice("http")).toBe(true);
    expect(isEnabledAdapterType("grok_bot")).toBe(true);
    expect(isValidAdapterType("grok_bot")).toBe(true);
    expect(isVisualAdapterChoice("grok_bot")).toBe(true);

    expect(
      listAdapterOptions((type) => type, [
        {
          ...externalAdapter,
          type: "http",
        },
      ]),
    ).toEqual([
      {
        value: "http",
        label: "http",
        comingSoon: false,
        hidden: false,
        experimental: false,
      },
    ]);
  });

  it("marks the retired ACPX adapter as unavailable for new selections", () => {
    expect(isEnabledAdapterType("acpx_local")).toBe(false);
    expect(isValidAdapterType("acpx_local")).toBe(false);
    expect(isVisualAdapterChoice("acpx_local")).toBe(false);

    expect(
      listAdapterOptions((type) => type, [
        {
          ...externalAdapter,
          type: "acpx_local",
        },
      ]),
    ).toEqual([
      {
        value: "acpx_local",
        label: "acpx_local",
        comingSoon: true,
        hidden: false,
        experimental: false,
      },
    ]);
  });
});
