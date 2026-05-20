"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { saveEstablishments } from "./_actions";

export type EstablishmentRow = {
  id?: string;
  name: string;
  levels: string[];
  order: number;
  isActive: boolean;
};

/**
 * Local row state carries `levelsText` (the raw comma-separated string the
 * user is typing) alongside the canonical `levels` array. We only parse text
 * → array on save — parsing on every keystroke breaks commas and paste.
 */
type EstablishmentRowState = EstablishmentRow & { levelsText: string };

export function EstablishmentsForm({
  initial,
}: {
  initial: EstablishmentRow[];
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<EstablishmentRowState[]>(
    initial.map((r) => ({ ...r, levelsText: r.levels.join(", ") })),
  );

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        name: "",
        levels: [],
        levelsText: "",
        order: prev.length,
        isActive: true,
      },
    ]);
  }

  function updateRow(idx: number, patch: Partial<EstablishmentRowState>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(idx: number) {
    setRows((prev) =>
      prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, order: i })),
    );
  }

  function moveRow(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next.map((r, i) => ({ ...r, order: i }));
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Drop blank rows (no name) before saving. Parse levelsText → array now.
    const cleaned = rows
      .filter((r) => r.name.trim().length > 0)
      .map((r, i) => ({
        id: r.id,
        name: r.name.trim(),
        levels: r.levelsText
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        order: i,
        isActive: r.isActive,
      }));
    const fd = new FormData();
    fd.append("establishments", JSON.stringify(cleaned));
    startTransition(async () => {
      const result = await saveEstablishments(fd);
      if (result.ok) {
        toast.success(t("establishments.saved"));
      } else {
        toast.error(t("establishments.saveError"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[color:var(--color-border-strong)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
          {t("establishments.empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, idx) => (
            <li
              key={idx}
              className={cn(
                "rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4",
                !row.isActive && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 flex-col gap-1 pt-7">
                  <button
                    type="button"
                    onClick={() => moveRow(idx, -1)}
                    disabled={idx === 0}
                    aria-label={t("establishments.moveUp")}
                    className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors enabled:hover:bg-[color:var(--color-surface-sunken)] enabled:hover:text-[color:var(--color-foreground-muted)] disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(idx, 1)}
                    disabled={idx === rows.length - 1}
                    aria-label={t("establishments.moveDown")}
                    className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors enabled:hover:bg-[color:var(--color-surface-sunken)] enabled:hover:text-[color:var(--color-foreground-muted)] disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_2fr]">
                  <Field
                    label={t("establishments.name")}
                    htmlFor={`est-name-${idx}`}
                  >
                    <Input
                      id={`est-name-${idx}`}
                      value={row.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      placeholder="Collège"
                      maxLength={80}
                    />
                  </Field>
                  <Field
                    label={t("establishments.levels")}
                    htmlFor={`est-levels-${idx}`}
                    hint={t("establishments.levelsHint")}
                  >
                    <Input
                      id={`est-levels-${idx}`}
                      value={row.levelsText}
                      onChange={(e) =>
                        updateRow(idx, { levelsText: e.target.value })
                      }
                      placeholder="6ème, 5ème, 4ème, 3ème"
                    />
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  aria-label={t("establishments.remove")}
                  className="mt-7 inline-flex size-8 shrink-0 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger)]"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>

              <label className="mt-3 inline-flex items-center gap-2 text-xs text-[color:var(--color-foreground-muted)]">
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(e) =>
                    updateRow(idx, { isActive: e.target.checked })
                  }
                />
                {t("establishments.active")}
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)]"
        >
          <Plus className="size-4" aria-hidden />
          {t("establishments.add")}
        </button>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
