/** RFC 7230 token. Header names such as `X-Api-Key` are valid. */
export const HTTP_HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type HttpHeaderRow = {
  id: string;
  name: string;
  source: "plain" | "secret";
  value: string;
  secretId: string;
  version: number | "latest";
};

let rowCounter = 0;

function nextRowId(): string {
  rowCounter += 1;
  return `http-header-${rowCounter}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSecretRef(value: unknown): value is { secretId: string; version?: unknown } {
  return (
    isRecord(value) &&
    value.type === "secret_ref" &&
    typeof value.secretId === "string" &&
    value.secretId.length > 0
  );
}

export function readHttpHeaders(headers: unknown): {
  rows: HttpHeaderRow[];
  preserved: Record<string, unknown>;
} {
  if (!isRecord(headers)) return { rows: [], preserved: {} };
  const rows: HttpHeaderRow[] = [];
  const preserved: Record<string, unknown> = {};
  for (const [rawName, raw] of Object.entries(headers)) {
    const name = rawName.trim();
    if (!name) continue;
    if (typeof raw === "string") {
      rows.push({
        id: nextRowId(),
        name,
        source: "plain",
        value: raw,
        secretId: "",
        version: "latest",
      });
      continue;
    }
    if (isSecretRef(raw)) {
      rows.push({
        id: nextRowId(),
        name,
        source: "secret",
        value: "",
        secretId: raw.secretId,
        version: typeof raw.version === "number" ? raw.version : "latest",
      });
      continue;
    }
    preserved[name] = raw;
  }
  return { rows, preserved };
}

export function writeHttpHeaders(
  rows: readonly HttpHeaderRow[],
  preserved: Record<string, unknown> = {},
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const rowNames = new Set(rows.map((row) => row.name.trim()).filter(Boolean));
  for (const [name, value] of Object.entries(preserved)) {
    if (!rowNames.has(name)) out[name] = value;
  }
  for (const row of rows) {
    const name = row.name.trim();
    if (!HTTP_HEADER_NAME_RE.test(name)) continue;
    if (row.source === "secret") {
      if (!row.secretId) continue;
      out[name] = {
        type: "secret_ref",
        secretId: row.secretId,
        version: row.version ?? "latest",
      };
      continue;
    }
    out[name] = row.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeHttpHeaders(headers: unknown): Record<string, unknown> | undefined {
  const read = readHttpHeaders(headers);
  return writeHttpHeaders(read.rows, read.preserved);
}

export function httpHeaderValueKey(headers: unknown): string {
  return JSON.stringify(normalizeHttpHeaders(headers) ?? {});
}

export function emptyHttpHeaderRow(): HttpHeaderRow {
  return {
    id: nextRowId(),
    name: "",
    source: "plain",
    value: "",
    secretId: "",
    version: "latest",
  };
}
