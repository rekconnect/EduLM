"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { decideApplication } from "../_actions";

type Decision = "ACCEPTED" | "DECLINED" | "WAITLISTED" | "UNDER_REVIEW" | "INTERVIEW_SCHEDULED";

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
      const result = await decideApplication(applicationId, undefined, fd);
      if (result?.error) setError(result.error);
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
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {t("adminAcceptHint")}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
