"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updateSignupRetention } from "./_actions";

/**
 * Settings → Formulaires → "Comptes sans dossier": the delay after which a
 * self-registered parent account that never started a dossier is deleted.
 * Empty = never. Rules live in src/lib/signup-retention.ts.
 */
export function SignupRetentionForm({
  initial,
  minDays,
  maxDays,
}: {
  initial: {
    days: number | null;
    jobConfigured: boolean;
    campaignOpen: boolean;
    transition: { noDeletionBefore: string; newDelayFrom: string } | null;
  };
  minDays: number;
  maxDays: number;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(initial.days === null ? "" : String(initial.days));
  // What is saved on the server — the status lines below describe THIS, not
  // the value being typed.
  const [saved, setSaved] = useState(initial.days);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("signupRetentionDays", days.trim());
    startTransition(async () => {
      try {
        const result = await updateSignupRetention(fd);
        if (result.ok) {
          setSaved(days.trim() === "" ? null : Number(days));
          toast.success(t("updatedToast"));
        } else {
          toast.error(
            result.error === "validation"
              ? t("signupRetention.invalid", { min: minDays, max: maxDays })
              : t("errorToast"),
          );
        }
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="max-w-xs">
        <Field
          label={t("signupRetention.daysLabel")}
          htmlFor="signupRetentionDays"
          hint={t("signupRetention.daysHint")}
        >
          <Input
            id="signupRetentionDays"
            type="number"
            inputMode="numeric"
            min={minDays}
            max={maxDays}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder={t("signupRetention.daysPlaceholder")}
          />
        </Field>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <ul className="list-disc space-y-1 ps-4">
          <li>{t("signupRetention.ruleWho")}</li>
          <li>{t("signupRetention.ruleKept")}</li>
          <li>{t("signupRetention.ruleClock")}</li>
          <li>{t("signupRetention.rulePromise")}</li>
          <li>{t("signupRetention.ruleNotice")}</li>
        </ul>
      </div>

      {/* A shortened delay that is not in force yet. Comes from the server
          (refreshed after each save), so it always describes what is stored. */}
      {saved !== null && initial.transition ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t("signupRetention.transition", {
              date: initial.transition.noDeletionBefore,
              from: initial.transition.newDelayFrom,
            })}
          </span>
        </p>
      ) : null}
      {saved !== null && !initial.jobConfigured ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)] px-4 py-3 text-sm text-[color:var(--color-warning-soft-fg)]"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t("signupRetention.jobMissing")}</span>
        </p>
      ) : null}
      {saved !== null && !initial.campaignOpen ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t("signupRetention.campaignClosed")}</span>
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
