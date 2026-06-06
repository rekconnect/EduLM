"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input, Select, Textarea } from "@/components/ui/input";
import { evaluateShowIf, type FieldDef } from "@/lib/entity-fields";

const YESNO = (v: string) =>
  v === "yes" || v === "Oui" || v === "true"
    ? "Oui"
    : v === "no" || v === "Non" || v === "false"
      ? "Non"
      : v;

function EditField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const common = {
    id: `e-${field.key}`,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };
  let control: React.ReactNode;
  switch (field.type) {
    case "select":
      control = (
        <Select {...common}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
      break;
    case "yes_no":
      control = (
        <Select {...common}>
          <option value="">—</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </Select>
      );
      break;
    case "long_text":
      control = <Textarea {...common} rows={2} />;
      break;
    case "date":
      control = <Input {...common} type="date" />;
      break;
    case "email":
      control = <Input {...common} type="email" />;
      break;
    case "phone":
      control = <Input {...common} type="tel" />;
      break;
    case "number":
      control = <Input {...common} type="number" inputMode="decimal" />;
      break;
    default:
      control = <Input {...common} type="text" />;
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs text-[color:var(--color-foreground-muted)]">{field.label}</span>
      {control}
    </label>
  );
}

/**
 * One editable category block: a small title + its own pencil. Click to
 * edit just this block's fields in place; Save routes via the supplied
 * server action. Used for every category on a parent, the address, and
 * each child.
 */
export function EditableGroup({
  title,
  fields,
  initialValues,
  onSave,
  rtl = false,
}: {
  title: string;
  fields: FieldDef[];
  initialValues: Record<string, string>;
  onSave: (values: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
  rtl?: boolean;
}) {
  const seed = () =>
    Object.fromEntries(fields.map((f) => [f.key, initialValues[f.key] ?? ""]));
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(seed);
  const [pending, start] = useTransition();

  if (fields.length === 0) return null;

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  // Honor conditional visibility (showIf / hideIf). Recomputes from `values`,
  // so toggling e.g. Transport = Non hides Aller/Retour live while editing.
  // Answers are keyed by field key, which equals the field id for our config,
  // so the rules' fieldId references resolve correctly.
  const visible = fields.filter((f) => evaluateShowIf(f, values));

  function save() {
    start(async () => {
      const r = await onSave(values);
      if (r.ok) {
        toast.success("Enregistré");
        setEditing(false);
      } else {
        toast.error("Échec de l'enregistrement");
      }
    });
  }
  function cancel() {
    setValues(seed());
    setEditing(false);
  }

  const readRows = visible
    .map((f) => [f.label, f.type === "yes_no" ? YESNO(values[f.key] ?? "") : values[f.key] ?? ""] as [string, string])
    .filter(([, v]) => v && v.trim().length > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          {title}
        </h4>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              aria-label="Annuler"
              className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
            >
              <X className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-6 items-center gap-1 rounded bg-[color:var(--color-brand-600)] px-2 text-xs font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Modifier ${title}`}
            className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
          >
            <Pencil className="size-3" aria-hidden />
          </button>
        )}
      </div>

      {editing ? (
        <div dir={rtl ? "rtl" : undefined} className="grid gap-3 sm:grid-cols-2">
          {visible.map((f) => (
            <EditField key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
          ))}
        </div>
      ) : readRows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-subtle)]">—</p>
      ) : (
        <dl dir={rtl ? "rtl" : undefined} className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {readRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-[color:var(--color-foreground-muted)]">{label}</dt>
              <dd className="truncate text-sm font-medium text-[color:var(--color-foreground)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
