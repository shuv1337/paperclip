import { describe, expect, it } from "vitest";
import { NO_ACTIVE_CEO_JOIN_APPROVAL_CODE } from "@paperclipai/shared";
import { ApiError } from "../api/client";
import {
  AGENTS_PAGE_HREF,
  SET_CEO_ACTION_LABEL,
  describeNoActiveCeoError,
  joinApprovalErrorToast,
} from "./join-approval-error";

const MESSAGE = "Join request cannot be approved because this company has no active CEO";
const HINT = "Set an existing agent's role to CEO, then approve this join request again.";

function noCeoError() {
  return new ApiError(MESSAGE, 409, {
    error: MESSAGE,
    code: NO_ACTIVE_CEO_JOIN_APPROVAL_CODE,
    details: {
      code: NO_ACTIVE_CEO_JOIN_APPROVAL_CODE,
      hint: HINT,
    },
  });
}

describe("describeNoActiveCeoError", () => {
  it("keeps the server message and hint and links to the agents page", () => {
    expect(describeNoActiveCeoError(noCeoError())).toEqual({
      message: `${MESSAGE} ${HINT}`,
      actionLabel: SET_CEO_ACTION_LABEL,
      href: AGENTS_PAGE_HREF,
    });
  });

  it("reads the code from details when the top-level code is absent", () => {
    const error = new ApiError(MESSAGE, 409, {
      error: MESSAGE,
      details: { code: NO_ACTIVE_CEO_JOIN_APPROVAL_CODE, hint: HINT },
    });
    expect(describeNoActiveCeoError(error)?.actionLabel).toBe("Set a CEO");
  });

  it("ignores unrelated approval failures", () => {
    const error = new ApiError("Join request is not pending", 409, {
      error: "Join request is not pending",
    });
    expect(describeNoActiveCeoError(error)).toBeNull();
    expect(joinApprovalErrorToast(error, "Failed to approve join request")).toEqual({
      title: "Failed to approve join request",
      body: "Join request is not pending",
      tone: "error",
    });
  });

  it("adds a Set a CEO toast action for the no-CEO payload", () => {
    expect(joinApprovalErrorToast(noCeoError(), "Failed to approve join request")).toEqual({
      title: "Failed to approve join request",
      body: `${MESSAGE} ${HINT}`,
      tone: "error",
      action: { label: "Set a CEO", href: "/agents/all" },
    });
  });
});
