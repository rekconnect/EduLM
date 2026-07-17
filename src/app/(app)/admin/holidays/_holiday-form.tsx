"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { addHoliday, type FormState } from "./_actions";

export function HolidayForm() {
  const t = useTranslations("holidays");
  const [state, action, pending] = useActionState<FormState, FormData>(addHoliday, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok != null) formRef.current?.reset();
  }, [state.ok]);

  const errorText = state.error
    ? state.error === "rangeError"
      ? t("rangeError")
      : state.error === "tooLong"
        ? t("tooLong")
        : t("rangeError")
    : null;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormRow>
        <Field label={t("fieldFrom")} htmlFor="from" required>
          <Input id="from" name="from" type="date" required />
        </Field>
        <Field label={t("fieldTo")} htmlFor="to">
          <Input id="to" name="to" type="date" />
        </Field>
      </FormRow>
      <Field label={t("fieldLabel")} htmlFor="label" required>
        <Input id="label" name="label" required maxLength={120} placeholder={t("labelPlaceholder")} />
      </Field>

      {errorText ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {errorText}
        </p>
      ) : null}
      {state.ok != null && state.ok > 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-[color:var(--color-success-soft-fg)]" role="status">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("added", { n: state.ok })}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("adding") : t("add")}
        </Button>
      </div>
    </form>
  );
}
