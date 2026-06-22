"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Input, Select } from "@/components/ui/input";

export type BuiltinMode = "required" | "optional" | "hidden";
export type BuiltinMeta = { label?: string; order?: number };

/**
 * Editable list of the standard fields for an admin create-form. Every row is
 * uniform: reorder arrows, an editable label input (shows the current label —
 * default or override — and editing it renames the field, clearing reverts to
 * default), and a Required/Optional/Hidden dropdown. Mandatory fields pass
 * `isLocked` ⇒ their dropdown is fixed to "Required" and disabled (you can't
 * create the record without them), but they can still be renamed and reordered.
 * Shared by the "Add a parent" and "Add a student" editors.
 */
export function BuiltinFieldsList<K extends string>({
  keys,
  modeOf,
  isLocked,
  meta,
  defaultLabel,
  modeLabels,
  upLabel,
  downLabel,
  onMode,
  onLabel,
  onMove,
}: {
  keys: readonly K[];
  modeOf: (k: K) => BuiltinMode;
  isLocked?: (k: K) => boolean;
  meta: Partial<Record<K, BuiltinMeta>>;
  defaultLabel: (k: K) => string;
  modeLabels: { required: string; optional: string; hidden: string };
  upLabel: string;
  downLabel: string;
  onMode: (k: K, m: BuiltinMode) => void;
  onLabel: (k: K, label: string) => void;
  onMove: (k: K, dir: -1 | 1) => void;
}) {
  const ordered = [...keys].sort(
    (a, b) =>
      (meta[a]?.order ?? keys.indexOf(a)) - (meta[b]?.order ?? keys.indexOf(b)),
  );

  return (
    <div className="space-y-2">
      {ordered.map((k, i) => {
        const locked = isLocked?.(k) ?? false;
        return (
          <div
            key={k}
            className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-2.5"
          >
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onMove(k, -1)}
                disabled={i === 0}
                aria-label={upLabel}
                className="inline-flex size-5 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)] disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onMove(k, 1)}
                disabled={i === ordered.length - 1}
                aria-label={downLabel}
                className="inline-flex size-5 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)] disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </div>

            <Input
              className="min-w-0 flex-1"
              value={meta[k]?.label ?? defaultLabel(k)}
              placeholder={defaultLabel(k)}
              onChange={(e) => onLabel(k, e.target.value)}
            />

            <div className="w-32 shrink-0">
              <Select
                value={modeOf(k)}
                disabled={locked}
                onChange={(e) => onMode(k, e.target.value as BuiltinMode)}
              >
                <option value="required">{modeLabels.required}</option>
                <option value="optional">{modeLabels.optional}</option>
                <option value="hidden">{modeLabels.hidden}</option>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
