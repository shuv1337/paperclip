// @vitest-environment jsdom

import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_ACTIVE_CEO_JOIN_APPROVAL_CODE } from "@paperclipai/shared";
import { ApiError } from "../api/client";
import { ActionErrorLine, actionErrorFromUnknown } from "./ActionErrorLine";

vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ActionErrorLine", () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      flushSync(() => {
        root?.unmount();
      });
      root = null;
    }
    document.body.innerHTML = "";
  });

  it("shows Set a CEO as a link to the agents page", () => {
    const error = new ApiError(
      "Join request cannot be approved because this company has no active CEO",
      409,
      {
        error: "Join request cannot be approved because this company has no active CEO",
        code: NO_ACTIVE_CEO_JOIN_APPROVAL_CODE,
        details: {
          code: NO_ACTIVE_CEO_JOIN_APPROVAL_CODE,
          hint: "Set an existing agent's role to CEO, then approve this join request again.",
        },
      },
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ActionErrorLine error={actionErrorFromUnknown(error, "Failed to approve join request")} />,
      );
    });

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Set a CEO");
    expect(link?.getAttribute("href")).toBe("/agents/all");
    expect(container.textContent).toContain("no active CEO");
    expect(container.textContent).toContain("Set an existing agent's role to CEO");
  });
});
