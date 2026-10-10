import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import {
  noActiveCeoJoinApprovalError,
  resolveJoinRequestAgentManagerId,
} from "../routes/access.js";

describe("resolveJoinRequestAgentManagerId", () => {
  it("returns null when no CEO exists in the company agent list", () => {
    const managerId = resolveJoinRequestAgentManagerId([
      { id: "a1", role: "cto", reportsTo: null },
      { id: "a2", role: "engineer", reportsTo: "a1" },
    ]);

    expect(managerId).toBeNull();
  });

  it("selects the root CEO when available", () => {
    const managerId = resolveJoinRequestAgentManagerId([
      { id: "ceo-child", role: "ceo", reportsTo: "manager-1" },
      { id: "manager-1", role: "cto", reportsTo: null },
      { id: "ceo-root", role: "ceo", reportsTo: null },
    ]);

    expect(managerId).toBe("ceo-root");
  });

  it("falls back to the first CEO when no root CEO is present", () => {
    const managerId = resolveJoinRequestAgentManagerId([
      { id: "ceo-1", role: "ceo", reportsTo: "mgr" },
      { id: "ceo-2", role: "ceo", reportsTo: "mgr" },
      { id: "mgr", role: "cto", reportsTo: null },
    ]);

    expect(managerId).toBe("ceo-1");
  });
});

describe("noActiveCeoJoinApprovalError", () => {
  it("returns a 409 payload with no_active_ceo and a hint", () => {
    const error = noActiveCeoJoinApprovalError();
    const json = vi.fn();
    const res = {
      status: vi.fn(),
      json,
    } as unknown as Response;
    (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);

    errorHandler(
      error,
      {
        method: "POST",
        originalUrl: "/api/companies/company-1/join-requests/request-1/approve",
        body: {},
        params: {},
        query: {},
      } as unknown as Request,
      res,
      vi.fn() as unknown as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: "Join request cannot be approved because this company has no active CEO",
      code: "no_active_ceo",
      details: {
        code: "no_active_ceo",
        hint: "Set an existing agent's role to CEO, then approve this join request again.",
      },
    });
  });
});
