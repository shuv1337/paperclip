import { configFieldsForSection } from "../config-sections";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  DraftNumberInput,
  DraftTextarea,
} from "../../components/agent-config-primitives";
import { SecretBindingPicker } from "../../components/SecretBindingPicker";
import { GROK_BOT_FORM_FIELDS, type GrokBotFormField } from "./fields";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function isSecretRef(value: unknown): value is { secretId: string; version?: number | "latest" } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "secret_ref" &&
    typeof (value as { secretId?: unknown }).secretId === "string"
  );
}

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

function renderField(field: GrokBotFormField, props: AdapterConfigFieldsProps) {
  if (field.kind === "secret") {
    const stored = props.isCreate
      ? props.values?.adapterSchemaValues?.webhookKey
      : props.eff("adapterConfig", "webhookKey", props.config.webhookKey);
    const ref = isSecretRef(stored) ? stored : null;
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <SecretBindingPicker
          label=""
          value={ref ? { secretId: ref.secretId, version: ref.version ?? "latest" } : null}
          onChange={(next) => writeSchema(
            props,
            field.key,
            next
              ? { type: "secret_ref", secretId: next.secretId, version: next.version ?? "latest" }
              : undefined,
          )}
          placeholder="Select webhook secret"
        />
      </Field>
    );
  }

  if (field.kind === "select") {
    const fallback = String(field.defaultValue ?? "");
    const current = String(readSchema(props, field.key, fallback) ?? "") || fallback;
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

  if (field.kind === "number") {
    const fallback = typeof field.defaultValue === "number" ? field.defaultValue : 0;
    const current = Number(readSchema(props, field.key, fallback));
    const safe = Number.isFinite(current) ? current : fallback;
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <DraftNumberInput
          aria-label={field.label}
          value={safe}
          onCommit={(next) => writeSchema(props, field.key, Math.max(0, next))}
          immediate
          className={inputClass}
        />
      </Field>
    );
  }

  if (field.kind === "textarea") {
    const value = String(readSchema(props, field.key, "") ?? "");
    return (
      <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
        <DraftTextarea
          value={value}
          onCommit={(next) => writeSchema(props, field.key, next || undefined)}
          immediate
          placeholder={field.placeholder}
        />
      </Field>
    );
  }

  const value = String(readSchema(props, field.key, "") ?? "");
  return (
    <Field key={field.key} configSection={field.section} label={field.label} hint={field.hint}>
      <DraftInput
        value={value}
        onCommit={(next) => writeSchema(props, field.key, next || undefined)}
        immediate
        className={inputClass}
        placeholder={field.placeholder}
        aria-label={field.label}
      />
    </Field>
  );
}

export function GrokBotConfigFields(props: AdapterConfigFieldsProps) {
  return configFieldsForSection(
    props.section,
    <>
      {GROK_BOT_FORM_FIELDS.map((field) => renderField(field, props))}
    </>,
  );
}
