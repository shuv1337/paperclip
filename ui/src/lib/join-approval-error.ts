import { NO_ACTIVE_CEO_JOIN_APPROVAL_CODE } from "@paperclipai/shared";
import { ApiError } from "../api/client";

export const SET_CEO_ACTION_LABEL = "Set a CEO";
export const AGENTS_PAGE_HREF = "/agents/all";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Machine-readable code from an API error body, including nested `details`. */
export function joinApprovalErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = asRecord(error.body);
  if (!body) return null;
  if (typeof body.code === "string" && body.code) return body.code;
  const details = asRecord(body.details);
  return typeof details?.code === "string" && details.code ? details.code : null;
}

export function joinApprovalErrorHint(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = asRecord(asRecord(error.body)?.details);
  const hint = details?.hint;
  return typeof hint === "string" && hint.trim() ? hint.trim() : null;
}

export interface NoActiveCeoNotice {
  message: string;
  actionLabel: typeof SET_CEO_ACTION_LABEL;
  href: typeof AGENTS_PAGE_HREF;
}

/**
 * Join approval failed because the company has no CEO. The notice keeps the
 * server explanation and points at the agents page, where role can be edited.
 */
export function describeNoActiveCeoError(error: unknown): NoActiveCeoNotice | null {
  if (joinApprovalErrorCode(error) !== NO_ACTIVE_CEO_JOIN_APPROVAL_CODE) return null;
  const reason = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "This company has no active CEO.";
  const hint = joinApprovalErrorHint(error);
  const message = hint && !reason.includes(hint) ? `${reason} ${hint}` : reason;
  return {
    message,
    actionLabel: SET_CEO_ACTION_LABEL,
    href: AGENTS_PAGE_HREF,
  };
}

export function joinApprovalErrorToast(error: unknown, title: string) {
  const notice = describeNoActiveCeoError(error);
  return {
    title,
    body: notice?.message ?? (error instanceof Error ? error.message : title),
    tone: "error" as const,
    ...(notice
      ? { action: { label: notice.actionLabel, href: notice.href } }
      : {}),
  };
}
