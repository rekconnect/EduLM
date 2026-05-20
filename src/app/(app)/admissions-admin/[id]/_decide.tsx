"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { decideApplication } from "../_actions";

type Decision =
  | "ACCEPTED"
  | "DECLINED"
  | "WAITLISTED"
  | "UNDER_REVIEW"
  | "INTERVIEW_SCHEDULED";

export function DecideForm({
  applicationId,
  classes,
}: {
  applicationId: string;
  classes: { id: string; name: string; level: string; section: string }[];
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<Decision>("UNDER_REVIEW");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await decideApplication(applicationId, undefined, fd);
        if (result?.error) {
          setError(result.error);
          toast.error(t("decisionErrorToast"));
        } else {
          toast.success(t("decisionSuccessToast"));
        }
      } catch {
        toast.error(t("decisionErrorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormRow>
        <Field label={t("adminReview")} htmlFor="decision" required>
          <Select
            id="decision"
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value as Decision)}
          >
            <option value="UNDER_REVIEW">{t("statusUnderReview")}</option>
            <option value="INTERVIEW_SCHEDULED">{t("statusInterview")}</option>
            <option value="ACCEPTED">{t("adminAccept")}</option>
            <option value="WAITLISTED">{t("adminWaitlist")}</option>
            <option value="DECLINED">{t("adminDecline")}</option>
          </Select>
        </Field>
        {decision === "ACCEPTED" ? (
          <Field label={t("adminAssignClass")} htmlFor="classId" required>
            <Select id="classId" name="classId" required defaultValue="">
              <option value="" disabled>
                —
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <span />
        )}
      </FormRow>

      <Field label={t("adminDecisionNote")} htmlFor="decisionNote">
        <Textarea id="decisionNote" name="decisionNote" rows={3} />
      </Field>

      {decision === "ACCEPTED" ? (
        <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-success)]/30 bg-[color:var(--color-success-soft)] px-3 py-2 text-xs text-[color:var(--color-success-soft-fg)]">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{t("adminAcceptHint")}</span>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger-soft-fg)]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="gap-2"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden />
          )}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
