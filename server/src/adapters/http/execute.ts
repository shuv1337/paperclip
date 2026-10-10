import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, parseObject } from "../utils.js";
import { beginAsyncHttpRun, discardAsyncHttpRun, type AsyncHttpRunCompletion } from "./async-run.js";
import { requireHttpRequestHeaders } from "./headers.js";
import { guardedHttpAdapterFetch } from "./remote-fetch.js";
import { resolveHttpTimeoutMs } from "./timeout.js";

type HttpResponseMode = "sync" | "async" | "auto";

export type HttpExecuteOptions = {
  /**
   * Adjust headers after the JSON body is finalized.
   * Grok Bot uses this to add a bearer header or an HMAC of the exact body.
   */
  finalizeHeaders?: (
    bodyText: string,
    headers: Record<string, string>,
  ) => Record<string, string>;
};

function readResponseMode(config: Record<string, unknown>): HttpResponseMode {
  const raw = asString(config.responseMode, "auto").trim().toLowerCase();
  if (raw === "sync" || raw === "async") return raw;
  return "auto";
}

export function httpRunCompleteUrl(runId: string, config: Record<string, unknown>): string {
  const configured = asString(config.callbackBaseUrl, "").trim()
    || (process.env.PAPERCLIP_API_URL ?? "").trim();
  const base = configured.replace(/\/+$/, "").replace(/\/api$/, "");
  const path = `/api/runs/${runId}/complete`;
  return base ? `${base}${path}` : path;
}

async function responseRequestsAsync(res: Response): Promise<boolean> {
  if (res.status === 202) {
    await res.text().catch(() => "");
    return true;
  }
  const text = await res.text().catch(() => "");
  if (!text.trim()) return false;
  try {
    const parsed = JSON.parse(text) as { async?: unknown };
    return Boolean(parsed && typeof parsed === "object" && parsed.async === true);
  } catch {
    return false;
  }
}

function waitForAsyncCompletion(
  completion: Promise<AsyncHttpRunCompletion>,
  signal: AbortSignal,
): Promise<AsyncHttpRunCompletion> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    completion.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err) => {
        cleanup();
        reject(err);
      },
    );
    signal.addEventListener("abort", onAbort);
  });
}

export async function execute(
  ctx: AdapterExecutionContext,
  options?: HttpExecuteOptions,
): Promise<AdapterExecutionResult> {
  const { config, runId, agent, context } = ctx;
  const url = asString(config.url, "");
  if (!url) throw new Error("HTTP adapter missing url");

  const method = asString(config.method, "POST").trim().toUpperCase() || "POST";
  const timeoutMs = resolveHttpTimeoutMs(config);
  const responseMode = readResponseMode(config);
  const headers = requireHttpRequestHeaders(config.headers);
  const payloadTemplate = parseObject(config.payloadTemplate);
  const mayDefer = responseMode !== "sync";
  const session = mayDefer
    ? beginAsyncHttpRun({ runId, agentId: agent.id, companyId: agent.companyId })
    : null;
  const paperclipCallback = session
    ? {
        runId,
        url: httpRunCompleteUrl(runId, config),
        token: session.token,
        method: "POST" as const,
        auth: "bearer" as const,
        ...(timeoutMs > 0 ? { timeoutSec: Math.ceil(timeoutMs / 1000) } : {}),
      }
    : null;
  const body = {
    ...payloadTemplate,
    agentId: agent.id,
    runId,
    context,
    connectionInstructions: context.connectionInstructions ?? null,
    ...(ctx.runtimeTools ? { paperclipRuntimeTools: ctx.runtimeTools } : {}),
    ...(paperclipCallback ? { paperclipCallback } : {}),
  };

  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort();
  if (ctx.signal) {
    if (ctx.signal.aborted) controller.abort();
    else ctx.signal.addEventListener("abort", onParentAbort, { once: true });
  }
  const timer = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;

  const abortedResult = (): AdapterExecutionResult => {
    if (ctx.signal?.aborted && !timedOut) {
      return {
        exitCode: null,
        signal: "SIGTERM",
        timedOut: false,
        errorMessage: "Async HTTP run cancelled",
      };
    }
    return {
      exitCode: null,
      signal: null,
      timedOut: true,
      errorMessage: `HTTP ${method} ${url} timed out after ${timeoutMs}ms`,
      errorCode: "timeout",
    };
  };

  try {
    await ctx.onCancellationReady?.();
    // HTTP adapters have no child-process spawn event. Signal immediately
    // before starting the remote request so dispatch gates can release without
    // waiting for the endpoint to respond.
    ctx.onDispatch?.();
    const bodyText = JSON.stringify(body);
    const requestHeaders = options?.finalizeHeaders
      ? options.finalizeHeaders(bodyText, {
          "content-type": "application/json",
          ...headers,
        })
      : {
          "content-type": "application/json",
          ...headers,
        };
    const res = await guardedHttpAdapterFetch(url, {
      method,
      headers: requestHeaders,
      body: bodyText,
      ...(timer || ctx.signal ? { signal: controller.signal } : {}),
    });

    if (!res.ok) {
      throw new Error(`HTTP invoke failed with status ${res.status}`);
    }

    const signaledAsync = mayDefer ? await responseRequestsAsync(res) : false;
    const remoteAsync = responseMode === "async" || signaledAsync;
    if (!remoteAsync || !session) {
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        summary: `HTTP ${method} ${url}`,
      };
    }

    await ctx.onLog(
      "stdout",
      `HTTP adapter accepted async work; waiting for POST /api/runs/${runId}/complete\n`,
    );
    const completion = await waitForAsyncCompletion(session.completion, controller.signal);
    if (completion.status === "failed") {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: completion.summary ?? "Async HTTP run failed",
        summary: completion.summary,
      };
    }
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: completion.summary ?? `HTTP ${method} ${url}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return abortedResult();
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    ctx.signal?.removeEventListener("abort", onParentAbort);
    discardAsyncHttpRun(runId);
  }
}
