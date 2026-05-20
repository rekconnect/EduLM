"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlignLeft,
  Calendar,
  Check,
  Hash,
  List,
  Loader2,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  QUESTION_TYPES,
  type CustomQuestion,
  type QuestionType,
} from "@/lib/admission-fields";
import { updateCycleCustomQuestions } from "../../_actions";

const TYPE_ICONS: Record<QuestionType, typeof Type> = {
  short_text: Type,
  long_text: AlignLeft,
  yes_no: ToggleLeft,
  select: List,
  date: Calendar,
  number: Hash,
};

function makeId() {
  // Stable identifier per question; not used for security so Math.random is fine.
  return `q_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function CustomQuestionsForm({
  cycleId,
  initial,
}: {
  cycleId: string;
  initial: CustomQuestion[];
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [questions, setQuestions] = useState<CustomQuestion[]>(initial);
  const [pending, startTransition] = useTransition();

  function add() {
    setQuestions((prev) => [
      ...prev,
      {
        id: makeId(),
        type: "short_text",
        label: "",
        required: false,
        options: [],
      },
    ]);
  }

  function update(idx: number, patch: Partial<CustomQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    );
  }

  function remove(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function move(idx: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Drop questions with empty labels — UI didn't fill them out.
    const cleaned = questions
      .map((q) => ({ ...q, label: q.label.trim() }))
      .filter((q) => q.label.length > 0);

    const fd = new FormData();
    fd.append("questions", JSON.stringify(cleaned));

    startTransition(async () => {
      try {
        const result = await updateCycleCustomQuestions(cycleId, fd);
        if (result.error) {
          toast.error(t("customQuestionsErrorToast"));
        } else {
          toast.success(t("customQuestionsSuccessToast"));
          setQuestions(cleaned);
        }
      } catch {
        toast.error(t("customQuestionsErrorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {questions.length === 0 ? (
        <div className="rounded-md border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-4 py-8 text-center">
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            {t("customQuestionsEmpty")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {questions.map((q, idx) => (
            <li key={q.id}>
              <QuestionRow
                question={q}
                index={idx}
                total={questions.length}
                onChange={(p) => update(idx, p)}
                onRemove={() => remove(idx)}
                onMove={(d) => move(idx, d)}
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
          {t("customQuestionsAdd")}
        </button>
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

function QuestionRow({
  question,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  t,
}: {
  question: CustomQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<CustomQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  t: (key: string) => string;
}) {
  const Icon = TYPE_ICONS[question.type];
  return (
    <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={t("customQuestionLabel")} htmlFor={`q-${question.id}-label`}>
              <Input
                id={`q-${question.id}-label`}
                value={question.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder={t("customQuestionLabelPlaceholder")}
                maxLength={200}
              />
            </Field>
            <Field label={t("customQuestionType")} htmlFor={`q-${question.id}-type`}>
              <Select
                id={`q-${question.id}-type`}
                value={question.type}
                onChange={(e) =>
                  onChange({ type: e.target.value as QuestionType })
                }
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {questionTypeLabel(t)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {question.type === "select" ? (
            <Field
              label={t("customQuestionOptions")}
              htmlFor={`q-${question.id}-options`}
              hint={t("customQuestionOptionsHint")}
            >
              <Textarea
                id={`q-${question.id}-options`}
                value={(question.options ?? []).join("\n")}
                onChange={(e) =>
                  onChange({
                    options: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={Math.max(3, (question.options ?? []).length + 1)}
                placeholder={t("customQuestionOptionsPlaceholder")}
              />
            </Field>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[color:var(--color-foreground)]">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="size-4 rounded border-[color:var(--color-border-strong)] text-[color:var(--color-brand-500)] focus:ring-[color:var(--color-border-focus)]"
              />
              <span className="font-medium">
                {t("customQuestionRequired")}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                aria-label={t("customQuestionMoveUp")}
                title={t("customQuestionMoveUp")}
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
                title={t("customQuestionMoveDown")}
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
                title={t("customQuestionRemove")}
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

function questionTypeLabel(t: QuestionType): string {
  switch (t) {
    case "short_text": return "Texte court";
    case "long_text": return "Texte long";
    case "yes_no": return "Oui / Non";
    case "select": return "Choix multiple";
    case "date": return "Date";
    case "number": return "Nombre";
  }
}
