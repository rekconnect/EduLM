"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FieldVisibility, WizardStep } from "@/lib/admission-fields";
import { updateCycleFieldConfig } from "../../_actions";

type StepFields = {
  step: WizardStep;
  fields: Array<{
    key: string;
    labelKey: string;
    locked: boolean;
    current: FieldVisibility;
  }>;
};

export function FieldConfigForm({
  cycleId,
  steps,
}: {
  cycleId: string;
  steps: StepFields[];
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, FieldVisibility>>(() =>
    Object.fromEntries(
      steps.flatMap((s) => s.fields.map((f) => [f.key, f.current])),
    ),
  );

  function set(key: string, v: FieldVisibility) {
    setState((prev) => ({ ...prev, [key]: v }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, v] of Object.entries(state)) {
      fd.append(`field:${k}`, v);
    }
    startTransition(async () => {
      try {
        const result = await updateCycleFieldConfig(cycleId, fd);
        if (result.error) toast.error(t("fieldConfigErrorToast"));
        else toast.success(t("fieldConfigSuccessToast"));
      } catch {
        toast.error(t("fieldConfigErrorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {steps.map((s) => (
        <div key={s.step}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
            {t(`fieldStep_${s.step}`)}
          </p>
          <ul className="overflow-hidden rounded-md border border-[color:var(--color-border-subtle)]">
            {s.fields.map((f, i) => (
              <li
                key={f.key}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-[color:var(--color-border-subtle)]",
                )}
              >
                <span className="text-sm text-[color:var(--color-foreground)]">
                  {t(f.labelKey)}
                </span>
                {f.locked ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                    <Lock className="size-3" aria-hidden />
                    {t("visibilityLocked")}
                  </span>
                ) : (
                  <VisibilityToggle
                    value={state[f.key] ?? f.current}
                    onChange={(v) => set(f.key, v)}
                    labels={{
                      required: t("visibilityRequired"),
                      optional: t("visibilityOptional"),
                      hidden: t("visibilityHidden"),
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

function VisibilityToggle({
  value,
  onChange,
  labels,
}: {
  value: FieldVisibility;
  onChange: (v: FieldVisibility) => void;
  labels: Record<FieldVisibility, string>;
}) {
  const options: { v: FieldVisibility; icon: React.ReactNode }[] = [
    { v: "required", icon: <Check className="size-3" aria-hidden /> },
    { v: "optional", icon: null },
    { v: "hidden", icon: <EyeOff className="size-3" aria-hidden /> },
  ];

  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-0.5"
    >
      {options.map(({ v, icon }) => {
        const isActive = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-out",
              isActive
                ? v === "hidden"
                  ? "bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] shadow-card"
                  : v === "required"
                    ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
                    : "bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)] shadow-card"
                : "text-[color:var(--color-foreground-muted)] hover:text-[color:var(--color-foreground)]",
            )}
          >
            {icon}
            {labels[v]}
          </button>
        );
      })}
    </div>
  );
}
