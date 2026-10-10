function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Request timeout for the HTTP adapter.
 * `timeoutSec` is the documented field. `timeoutMs` remains for agents saved
 * through the API before the form wrote seconds.
 */
export function resolveHttpTimeoutMs(config: Record<string, unknown>): number {
  if (Object.prototype.hasOwnProperty.call(config, "timeoutSec")) {
    const seconds = finiteNumber(config.timeoutSec);
    if (seconds == null || seconds <= 0) return 0;
    return Math.floor(seconds * 1000);
  }
  const milliseconds = finiteNumber(config.timeoutMs);
  if (milliseconds == null || milliseconds <= 0) return 0;
  return Math.floor(milliseconds);
}
