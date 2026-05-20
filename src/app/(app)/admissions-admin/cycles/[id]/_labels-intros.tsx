"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { WizardStep } from "@/lib/admission-fields";
import { updateCycleLabelsAndIntros } from "../../_actions";

type FieldRow = {
  key: string;
  labelKey: string;
  defaultLabelFallback: string;
};

type StepBlock = {
  step: WizardStep;
  fields: FieldRow[];
};

export function LabelsAndIntrosForm({
  cycleId,
  steps,
  initialLabels,
  initialIntros,
}: {
  cycleId: string;
  steps: StepBlock[];
  initialLabels: Record<string, string>;
  initialIntros: Partial<Record<WizardStep, string>>;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels);
  const [intros, setIntros] = useState<Partial<Record<WizardStep, string>>>(
    initialIntros,
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, v] of Object.entries(labels)) {
      if (v.trim().length > 0) fd.append(`label:${k}`, v.trim());
    }
    for (const [step, v] of Object.entries(intros)) {
      if (v && v.trim().length > 0) fd.append(`intro:${step}`, v.trim());
    }
    startTransition(async () => {
      try {
        const result = await updateCycleLabelsAndIntros(cycleId, fd);
        if (result.error) toast.error(t("labelsErrorToast"));
        else toast.success(t("labelsSuccessToast"));
      } catch {
        toast.error(t("labelsErrorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      {steps.map((s) => (
        <div key={s.step} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
            {t(`fieldStep_${s.step}`)}
          </p>

          <Field
            label={t("stepIntroLabel")}
            htmlFor={`intro-${s.step}`}
            hint={t("stepIntroHint")}
          >
            <Textarea
              id={`intro-${s.step}`}
              rows={2}
              maxLength={1000}
              value={intros[s.step] ?? ""}
              onChange={(e) =>
                setIntros((prev) => ({ ...prev, [s.step]: e.target.value }))
              }
              placeholder={t("stepIntroPlaceholder")}
            />
          </Field>

          <ul className="overflow-hidden rounded-md border border-[color:var(--color-border-subtle)]">
            {s.fields.map((f, i) => (
              <li
                key={f.key}
                className={`flex items-center gap-3 px-3 py-2 ${
                  i > 0 ? "border-t border-[color:var(--color-border-subtle)]" : ""
                }`}
              >
                <span className="w-44 shrink-0 text-sm text-[color:var(--color-foreground-muted)]">
                  {t(f.labelKey)}
                </span>
                <Input
                  className="flex-1"
                  maxLength={120}
                  value={labels[f.key] ?? ""}
                  onChange={(e) =>
                    setLabels((prev) => ({
                      ...prev,
                      [f.key]: e.target.value,
                    }))
                  }
                  placeholder={f.defaultLabelFallback}
                />
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
