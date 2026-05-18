"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { sendContactMessage, type ContactFormState } from "@/app/admin/messages/_actions";

export function ContactForm() {
  const t = useTranslations("communication");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    sendContactMessage,
    {},
  );

  if (state.ok) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        ✓ {t("contactSent")}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <Field label={t("contactSubject")} htmlFor="subject" required error={state.errors?.subject}>
        <Input id="subject" name="subject" required autoFocus />
      </Field>
      <Field label={t("contactBody")} htmlFor="body" required error={state.errors?.body}>
        <Textarea id="body" name="body" rows={8} required />
      </Field>
      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : t("contactSubmit")}
        </Button>
      </div>
    </form>
  );
}
