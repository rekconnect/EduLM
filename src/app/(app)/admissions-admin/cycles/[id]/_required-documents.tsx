"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RequiredDocument } from "@/lib/admission-fields";
import { updateCycleRequiredDocuments } from "../../_actions";

function makeId() {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function RequiredDocumentsForm({
  cycleId,
  initial,
}: {
  cycleId: string;
  initial: RequiredDocument[];
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [docs, setDocs] = useState<RequiredDocument[]>(initial);
  const [pending, startTransition] = useTransition();

  function add() {
    setDocs((prev) => [
      ...prev,
      { id: makeId(), label: "", required: true },
    ]);
  }

  function update(idx: number, patch: Partial<RequiredDocument>) {
    setDocs((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }

  function remove(idx: number) {
    setDocs((prev) => prev.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    setDocs((prev) => {
      const next = [...prev];
      const tgt = idx + dir;
      if (tgt < 0 || tgt >= next.length) return prev;
      [next[idx], next[tgt]] = [next[tgt]!, next[idx]!];
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleaned = docs
      .map((d) => ({ ...d, label: d.label.trim() }))
      .filter((d) => d.label.length > 0);
    const fd = new FormData();
    fd.append("documents", JSON.stringify(cleaned));

    startTransition(async () => {
      try {
        const result = await updateCycleRequiredDocuments(cycleId, fd);
        if (result.error) toast.error(t("requiredDocsErrorToast"));
        else {
          toast.success(t("requiredDocsSuccessToast"));
          setDocs(cleaned);
        }
      } catch {
        toast.error(t("requiredDocsErrorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-4 py-8 text-center">
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            {t("requiredDocsEmpty")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {docs.map((d, idx) => (
            <li key={d.id}>
              <DocumentRow
                doc={d}
                index={idx}
                total={docs.length}
                onChange={(p) => update(idx, p)}
                onRemove={() => remove(idx)}
                onMove={(dir) => move(idx, dir)}
                t={t}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:border-[color:var(--color-brand-500)] hover:text-[color:var(--color-brand-600)]"
        >
          <Plus className="size-3.5" aria-hidden />
          {t("requiredDocsAdd")}
        </button>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

function DocumentRow({
  doc,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  t,
}: {
  doc: RequiredDocument;
  index: number;
  total: number;
  onChange: (patch: Partial<RequiredDocument>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
          <FileText className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Field
            label={t("requiredDocLabel")}
            htmlFor={`d-${doc.id}-label`}
          >
            <Input
              id={`d-${doc.id}-label`}
              value={doc.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder={t("requiredDocLabelPlaceholder")}
              maxLength={200}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("requiredDocAcceptedTypes")}
              htmlFor={`d-${doc.id}-accept`}
              hint={t("requiredDocAcceptedTypesHint")}
            >
              <Input
                id={`d-${doc.id}-accept`}
                value={doc.acceptedTypes ?? ""}
                onChange={(e) => onChange({ acceptedTypes: e.target.value })}
                placeholder="application/pdf,image/*"
                maxLength={500}
              />
            </Field>
            <Field
              label={t("requiredDocHint")}
              htmlFor={`d-${doc.id}-hint`}
            >
              <Input
                id={`d-${doc.id}-hint`}
                value={doc.hint ?? ""}
                onChange={(e) => onChange({ hint: e.target.value })}
                placeholder={t("requiredDocHintPlaceholder")}
                maxLength={300}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[color:var(--color-foreground)]">
              <input
                type="checkbox"
                checked={doc.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="size-4 rounded border-[color:var(--color-border-strong)] text-[color:var(--color-brand-500)] focus:ring-[color:var(--color-border-focus)]"
              />
              <span className="font-medium">
                {t("requiredDocRequired")}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                aria-label={t("customQuestionMoveUp")}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)] transition-colors",
                  index === 0
                    ? "opacity-30"
                    : "hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
                )}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                aria-label={t("customQuestionMoveDown")}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)] transition-colors",
                  index === total - 1
                    ? "opacity-30"
                    : "hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
                )}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={t("customQuestionRemove")}
                className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger)]"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
