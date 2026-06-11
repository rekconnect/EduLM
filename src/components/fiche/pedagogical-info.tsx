"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";

import { fieldsForLevel, type PField } from "./pedagogical-fields";

/**
 * "Renseignements pédagogiques" — the level-dependent registration choices
 * (Arabic track for CE2→3ème, langues/options for 2nde, spécialités for 1ère &
 * Terminale). Field definitions live in ./pedagogical-fields (plain module, so
 * the SERVER page can also call fieldsForLevel without crossing the client
 * boundary). Stored as flat customAnswers keys — the inscription form fills
 * the same keys and this section shows them automatically.
 */

const yn = (v: string) => (v === "yes" ? "Oui" : v === "no" ? "Non" : v || "—");

export function PedagogicalInfo({
  level,
  initial,
  onSave,
}: {
  level: string;
  initial: Record<string, string>;
  onSave?: (values: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const fields = fieldsForLevel(level);
  const seed = () => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""]));
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(seed);
  const [pending, start] = useTransition();

  if (fields.length === 0)
    return (
      <p className="text-sm text-[color:var(--color-foreground-subtle)]">
        Aucun renseignement pédagogique pour ce niveau.
      </p>
    );

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const toggleMulti = (k: string, opt: string) => {
    const cur = (values[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
    set(k, next.join(", "));
  };

  function save() {
    if (!onSave) return;
    start(async () => {
      const res = await onSave(values);
      if (res.ok) {
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

  const display = (f: PField) => {
    const v = values[f.key] ?? "";
    if (f.type === "yesno") return yn(v);
    return v || "—";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          Renseignements pédagogiques · {level}
        </h4>
        {onSave ? (
          editing ? (
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
              onClick={() => {
                setValues(seed());
                setEditing(true);
              }}
              aria-label="Modifier"
              className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          )
        ) : null}
      </div>

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) =>
            f.type === "multi" ? (
              <div key={f.key} className="space-y-1.5 sm:col-span-2">
                <span className="text-xs text-[color:var(--color-foreground-muted)]">{f.label}</span>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((opt) => {
                    const on = (values[f.key] ?? "").split(",").map((s) => s.trim()).includes(opt);
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => toggleMulti(f.key, opt)}
                        className={
                          "rounded-full border px-3 py-1 text-xs transition-colors duration-150 ease-out " +
                          (on
                            ? "border-[color:var(--color-brand-500)] bg-[color:var(--color-brand-600)] text-[color:var(--color-foreground-onbrand)]"
                            : "border-[color:var(--color-border)] text-[color:var(--color-foreground-muted)] hover:border-[color:var(--color-brand-500)]")
                        }
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <label key={f.key} className="block space-y-1">
                <span className="text-xs text-[color:var(--color-foreground-muted)]">{f.label}</span>
                <Select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">—</option>
                  {f.type === "yesno" ? (
                    <>
                      <option value="yes">Oui</option>
                      <option value="no">Non</option>
                    </>
                  ) : (
                    f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))
                  )}
                </Select>
              </label>
            ),
          )}
        </div>
      ) : (
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={"min-w-0" + (f.type === "multi" ? " sm:col-span-2" : "")}>
              <dt className="text-xs text-[color:var(--color-foreground-muted)]">{f.label}</dt>
              <dd className="text-sm font-medium text-[color:var(--color-foreground)]">{display(f)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
