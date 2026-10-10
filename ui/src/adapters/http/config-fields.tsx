import { useEffect, useRef, useState } from "react";
import { configFieldsForSection } from "../config-sections";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  DraftNumberInput,
} from "../../components/agent-config-primitives";
import { SecretBindingPicker } from "../../components/SecretBindingPicker";
import { HTTP_ADAPTER_FORM_FIELDS, type HttpAdapterFormField } from "./fields";
import {
  emptyHttpHeaderRow,
  httpHeaderValueKey,
  readHttpHeaders,
  writeHttpHeaders,
  type HttpHeaderRow,
} from "./headers";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function readSchema(props: AdapterConfigFieldsProps, key: string, fallback: unknown): unknown {
  if (props.isCreate) return props.values?.adapterSchemaValues?.[key] ?? fallback;
  return props.eff("adapterConfig", key, (props.config[key] ?? fallback) as never);
}

function writeSchema(props: AdapterConfigFieldsProps, key: string, value: unknown) {
  if (props.isCreate) {
    props.set?.({
      adapterSchemaValues: {
        ...props.values?.adapterSchemaValues,
        [key]: value,
      },
    });
    return;
  }
  props.mark("adapterConfig", key, value);
}

function HttpHeadersEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: Record<string, unknown> | undefined) => void;
}) {
  const preservedRef = useRef<Record<string, unknown>>({});
  const lastWritten = useRef<string | null>(null);
  const [rows, setRows] = useState<HttpHeaderRow[]>(() => {
    const read = readHttpHeaders(value);
    preservedRef.current = read.preserved;
    return read.rows;
  });
  const valueKey = httpHeaderValueKey(value);

  useEffect(() => {
    if (lastWritten.current === valueKey) return;
    const read = readHttpHeaders(value);
    preservedRef.current = read.preserved;
    lastWritten.current = valueKey;
    setRows(read.rows);
  }, [value, valueKey]);

  function commit(nextRows: HttpHeaderRow[]) {
    setRows(nextRows);
    const next = writeHttpHeaders(nextRows, preservedRef.current);
    lastWritten.current = httpHeaderValueKey(next);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <DraftInput
              value={row.name}
              onCommit={(name) => commit(rows.map((item) => item.id === row.id ? { ...item, name } : item))}
              immediate
              className={inputClass}
              placeholder="Authorization"
              aria-label="Header name"
            />
            <select
              aria-label={`Header value type for ${row.name || "new header"}`}
              className={inputClass}
              value={row.source}
              onChange={(event) => {
                const source = event.target.value === "secret" ? "secret" : "plain";
                commit(rows.map((item) => item.id === row.id ? { ...item, source } : item));
              }}
            >
              <option value="plain">Value</option>
              <option value="secret">Secret</option>
            </select>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Remove header ${row.name || "row"}`}
              onClick={() => commit(rows.filter((item) => item.id !== row.id))}
            >
              Remove
            </button>
          </div>
          {row.source === "secret" ? (
            <SecretBindingPicker
              label=""
              value={row.secretId ? { secretId: row.secretId, version: row.version } : null}
              onChange={(next) => commit(rows.map((item) => item.id === row.id
                ? {
                    ...item,
                    secretId: next?.secretId ?? "",
                    version: next?.version ?? "latest",
                  }
                : item))}
              placeholder="Select secret"
            />
          ) : (
            <DraftInput
              value={row.value}
              onCommit={(headerValue) => commit(rows.map((item) => item.id === row.id ? { ...item, value: headerValue } : item))}
              immediate
              className={inputClass}
              placeholder="Header value"
              aria-label={`Header value for ${row.name || "new header"}`}
            />
          )}
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setRows((current) => [...current, emptyHttpHeaderRow()])}
      >
        Add header
      </button>
    </div>
  );
}

function renderField(field: HttpAdapterFormField, props: AdapterConfigFieldsProps) {
  if (field.kind === "secretHeaders") {
    const value = props.isCreate
      ? props.values?.adapterSchemaValues?.headers
      : props.eff("adapterConfig", "headers", props.config.headers);
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <HttpHeadersEditor
          value={value}
          onChange={(next) => writeSchema(props, field.key, next)}
        />
      </Field>
    );
  }

  if (field.kind === "select") {
    const fallback = String(field.defaultValue ?? "");
    const raw = String(readSchema(props, field.key, fallback) ?? "");
    const current = field.key === "method"
      ? (raw.trim().toUpperCase() || fallback)
      : (raw || fallback);
    const options = field.options ?? [];
    const known = options.some((option) => option.value === current);
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <select
          aria-label={field.label}
          className={inputClass}
          value={current}
          onChange={(event) => writeSchema(props, field.key, event.target.value)}
        >
          {!known && current ? <option value={current}>{current}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.kind === "number" && field.key === "timeoutSec") {
    const fallback = typeof field.defaultValue === "number" ? field.defaultValue : 0;
    const stored = props.isCreate
      ? props.values?.adapterSchemaValues?.timeoutSec ?? props.values?.timeoutSec ?? fallback
      : props.config.timeoutSec ?? (
          typeof props.config.timeoutMs === "number" ? props.config.timeoutMs / 1000 : fallback
        );
    const current = props.isCreate
      ? Number(stored)
      : Number(props.eff("adapterConfig", "timeoutSec", stored as number));
    const safe = Number.isFinite(current) ? current : fallback;
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <DraftNumberInput
          aria-label={field.label}
          value={safe}
          onCommit={(next) => {
            const timeoutSec = Math.max(0, next);
            if (props.isCreate) {
              props.set?.({
                timeoutSec,
                adapterSchemaValues: {
                  ...props.values?.adapterSchemaValues,
                  timeoutSec,
                },
              });
              return;
            }
            props.mark("adapterConfig", "timeoutSec", timeoutSec);
          }}
          immediate
          className={inputClass}
        />
      </Field>
    );
  }

  if (field.kind === "number") {
    const fallback = typeof field.defaultValue === "number" ? field.defaultValue : 0;
    const current = Number(readSchema(props, field.key, fallback));
    const safe = Number.isFinite(current) ? current : fallback;
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <DraftNumberInput
          aria-label={field.label}
          value={safe}
          onCommit={(next) => writeSchema(props, field.key, next)}
          immediate
          className={inputClass}
        />
      </Field>
    );
  }

  const value = field.key === "url"
    ? (props.isCreate ? props.values?.url ?? "" : props.eff("adapterConfig", "url", String(props.config.url ?? "")))
    : String(readSchema(props, field.key, "") ?? "");
  return (
    <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
      <DraftInput
        value={String(value)}
        onCommit={(next) => {
          if (field.key === "url") {
            if (props.isCreate) props.set?.({ url: next });
            else props.mark("adapterConfig", "url", next || undefined);
            return;
          }
          writeSchema(props, field.key, next || undefined);
        }}
        immediate
        className={inputClass}
        placeholder={field.placeholder}
        aria-label={field.label}
      />
    </Field>
  );
}

export function HttpConfigFields(props: AdapterConfigFieldsProps) {
  return configFieldsForSection(
    props.section,
    <>
      {HTTP_ADAPTER_FORM_FIELDS.map((field) => renderField(field, props))}
    </>,
  );
}
