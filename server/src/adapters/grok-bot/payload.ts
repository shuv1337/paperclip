import { asString, parseObject } from "../utils.js";

const MAX_CONTEXT_BLOCK = 8_000;
const MAX_DESCRIPTION = 4_000;
const MAX_COMMENT = 2_000;
const MAX_COMMENTS = 5;

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

export function grokPaperclipApiUrl(config: Record<string, unknown>): string {
  const configured = asString(config.callbackBaseUrl, "").trim()
    || (process.env.PAPERCLIP_API_URL ?? "").trim();
  return configured.replace(/\/+$/, "");
}

export function readGrokContextBlock(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return clip(trimmed, MAX_CONTEXT_BLOCK);
}

/**
 * Compact issue snapshot so the bot can start work without an extra read.
 * The full heartbeat context is still sent beside this object.
 */
export function buildGrokTaskSnapshot(
  context: Record<string, unknown>,
): Record<string, unknown> | null {
  const wake = parseObject(context.paperclipWake);
  const issue = parseObject(wake.issue);
  const comments = Array.isArray(wake.comments) ? wake.comments : [];
  const recent = comments.slice(-MAX_COMMENTS).flatMap((entry) => {
    const comment = parseObject(entry);
    const id = asString(comment.id, "");
    const body = asString(comment.body, "");
    if (!id && !body) return [];
    return [{
      ...(id ? { id } : {}),
      ...(body ? { body: clip(body, MAX_COMMENT) } : {}),
    }];
  });
  const issueId = asString(issue.id, "")
    || asString(context.issueId, "")
    || asString(context.taskId, "");
  const identifier = asString(issue.identifier, "");
  const title = asString(issue.title, "");
  const description = asString(issue.description, "");
  const status = asString(issue.status, "");
  const wakeReason = asString(wake.reason, "") || asString(context.wakeReason, "");
  if (!issueId && !title && !description && recent.length === 0 && !wakeReason) return null;
  return {
    ...(issueId ? { issueId } : {}),
    ...(identifier ? { identifier } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description: clip(description, MAX_DESCRIPTION) } : {}),
    ...(status ? { status } : {}),
    ...(wakeReason ? { wakeReason } : {}),
    ...(recent.length > 0 ? { comments: recent } : {}),
  };
}

export function buildGrokWakeTemplate(input: {
  config: Record<string, unknown>;
  companyId: string;
  context: Record<string, unknown>;
}): Record<string, unknown> {
  const contextBlock = readGrokContextBlock(input.config.contextBlock);
  const task = buildGrokTaskSnapshot(input.context);
  return {
    kind: "wake",
    companyId: input.companyId,
    paperclipApiUrl: grokPaperclipApiUrl(input.config),
    ...(contextBlock ? { contextBlock } : {}),
    ...(task ? { task } : {}),
  };
}
