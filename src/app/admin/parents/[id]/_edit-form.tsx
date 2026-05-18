"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { ParentFormState } from "../_actions";

export function EditParentForm({
  action,
  initial,
}: {
  action: (state: ParentFormState, formData: FormData) => Promise<ParentFormState>;
  initial: { name: string; email: string; relation: string; locale: string };
}) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<ParentFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label={t("fieldName")} htmlFor="name" required error={state.errors?.name}>
          <Input id="name" name="name" defaultValue={initial.name} required />
        </Field>
        <Field
          label={t("fieldEmail")}
          htmlFor="email"
          required
          error={state.errors?.email === "exists" ? t("emailExists") : state.errors?.email}
        >
          <Input id="email" name="email" type="email" defaultValue={initial.email} required />
        </Field>
      </FormRow>

      <FormRow>
        <Field label={t("fieldRelation")} htmlFor="relation">
          <Input id="relation" name="relation" defaultValue={initial.relation} />
        </Field>
        <Field label={t("fieldLocale")} htmlFor="locale">
          <Select id="locale" name="locale" defaultValue={initial.locale || "fr"}>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </Field>
      </FormRow>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
