"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { submitRequest, type FormState } from "./_actions";

type Kind = "ABSENCE" | "PERMISSION" | "PRESENCE" | "PERMANENCE";

export function RequestForm({ supervisorName }: { supervisorName: string | null }) {
  const t = useTranslations("staff");
  const [kind, setKind] = useState<Kind>("ABSENCE");
  const [state, action, pending] = useActionState<FormState, FormData>(submitRequest, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setKind("ABSENCE");
    }
  }, [state.ok]);

  const timesRequired = kind === "PERMISSION";
  const timesShown = kind !== "ABSENCE"; // PERMISSION (required) + PRESENCE/PERMANENCE (optional)

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <FormRow>
        <Field label={t("fieldKind")} htmlFor="kind">
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="ABSENCE">{t("kindAbsence")}</option>
            <option value="PRESENCE">{t("kindPresence")}</option>
            <option value="PERMANENCE">{t("kindPermanence")}</option>
            <option value="PERMISSION">{t("kindPermission")}</option>
          </Select>
        </Field>
        <div className="hidden sm:block" />
      </FormRow>

      {kind === "ABSENCE" ? (
        <FormRow>
          <Field label={t("fieldStart")} htmlFor="startDate" required error={state.errors?.startDate}>
            <Input id="startDate" name="startDate" type="date" required />
          </Field>
          <Field label={t("fieldEnd")} htmlFor="endDate" required error={state.errors?.endDate}>
            <Input id="endDate" name="endDate" type="date" required />
          </Field>
        </FormRow>
      ) : (
        <>
          <Field label={t("fieldDate")} htmlFor="startDate" required error={state.errors?.startDate}>
            <Input id="startDate" name="startDate" type="date" required />
          </Field>
          {timesShown ? (
            <FormRow>
              <Field
                label={timesRequired ? t("fieldStartTime") : t("fieldStartTimeOptional")}
                htmlFor="startTime"
                required={timesRequired}
                error={state.errors?.startTime}
              >
                <Input id="startTime" name="startTime" type="time" required={timesRequired} />
              </Field>
              <Field
                label={timesRequired ? t("fieldEndTime") : t("fieldEndTimeOptional")}
                htmlFor="endTime"
                required={timesRequired}
                error={state.errors?.endTime}
              >
                <Input id="endTime" name="endTime" type="time" required={timesRequired} />
              </Field>
            </FormRow>
          ) : null}
        </>
      )}

      <Field label={t("fieldReason")} htmlFor="reason" required error={state.errors?.reason}>
        <Textarea id="reason" name="reason" rows={3} required maxLength={500} />
      </Field>

      <div className="flex items-center gap-2 rounded-md bg-[color:var(--color-surface-sunken)] px-3 py-2 text-xs text-[color:var(--color-foreground-muted)]">
        <ArrowRight className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
        {supervisorName ? t("routeVia", { name: supervisorName }) : t("routeFinance")}
      </div>

      {state.ok ? (
        <p className="flex items-center gap-1.5 text-sm text-[color:var(--color-success-soft-fg)]" role="status">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("requestSubmitted")}
        </p>
      ) : null}
      {state.formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submitRequest")}
        </Button>
      </div>
    </form>
  );
}
