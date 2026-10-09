import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AsyncHttpRunStatus = "succeeded" | "failed";

export type AsyncHttpRunCompletion = {
  status: AsyncHttpRunStatus;
  summary: string | null;
};

type PendingAsyncHttpRun = {
  runId: string;
  agentId: string;
  companyId: string;
  tokenHash: string;
  settled: boolean;
  resolve: (completion: AsyncHttpRunCompletion) => void;
};

const pendingByRunId = new Map<string, PendingAsyncHttpRun>();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokensMatch(storedHash: string, token: string) {
  const actual = Buffer.from(hashToken(token));
  const expected = Buffer.from(storedHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Register a run that stays open after the webhook returns. The token is shown
 * once, in the webhook payload. Only its hash is kept in memory.
 */
export function beginAsyncHttpRun(input: {
  runId: string;
  agentId: string;
  companyId: string;
}): { token: string; completion: Promise<AsyncHttpRunCompletion> } {
  const existing = pendingByRunId.get(input.runId);
  if (existing && !existing.settled) {
    existing.settled = true;
    existing.resolve({ status: "failed", summary: null });
  }

  const token = randomBytes(32).toString("base64url");
  let resolve!: (completion: AsyncHttpRunCompletion) => void;
  const completion = new Promise<AsyncHttpRunCompletion>((res) => {
    resolve = res;
  });
  pendingByRunId.set(input.runId, {
    runId: input.runId,
    agentId: input.agentId,
    companyId: input.companyId,
    tokenHash: hashToken(token),
    settled: false,
    resolve,
  });
  return { token, completion };
}

export function lookupAsyncHttpRunToken(
  token: string,
  runId: string,
): { runId: string; agentId: string; companyId: string } | null {
  const pending = pendingByRunId.get(runId);
  if (!pending || pending.settled) return null;
  if (!tokensMatch(pending.tokenHash, token)) return null;
  return {
    runId: pending.runId,
    agentId: pending.agentId,
    companyId: pending.companyId,
  };
}

export type CompleteAsyncHttpRunResult =
  | { ok: true }
  | { ok: false; code: "not_running" | "forbidden" };

export function completeAsyncHttpRun(input: {
  runId: string;
  status: AsyncHttpRunStatus;
  summary?: string | null;
  token?: string | null;
  agentId?: string | null;
}): CompleteAsyncHttpRunResult {
  const pending = pendingByRunId.get(input.runId);
  if (!pending || pending.settled) return { ok: false, code: "not_running" };
  const tokenOk = Boolean(input.token && tokensMatch(pending.tokenHash, input.token));
  const agentOk = Boolean(input.agentId && input.agentId === pending.agentId);
  if (!tokenOk && !agentOk) return { ok: false, code: "forbidden" };

  pending.settled = true;
  pendingByRunId.delete(input.runId);
  const summary = input.summary?.trim() ? input.summary.trim() : null;
  pending.resolve({ status: input.status, summary });
  return { ok: true };
}

/** Drop a session that will not be awaited. A settled session is left alone. */
export function discardAsyncHttpRun(runId: string) {
  const pending = pendingByRunId.get(runId);
  if (!pending || pending.settled) return;
  pending.settled = true;
  pendingByRunId.delete(runId);
}

export function resetAsyncHttpRunsForTests() {
  for (const pending of pendingByRunId.values()) {
    if (pending.settled) continue;
    pending.settled = true;
    pending.resolve({ status: "failed", summary: null });
  }
  pendingByRunId.clear();
}
