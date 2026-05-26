"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { RESPONSABLE_RELATIONS } from "@/app/(app)/parent/inscriptions/[id]/edit/_section-responsable-lebanese";
import type { ParentFormState } from "../_actions";

export function EditParentForm({
  action,
  initial,
  labels,
}: {
  action: (state: ParentFormState, formData: FormData) => Promise<ParentFormState>;
  initial: {
    firstName: string;
    lastName: string;
    email: string;
    relation: string;
    locale: string;
  };
  /**
   * Override the default i18n labels for built-in fields. Pass the
   * tenant-configured labels (resolved from parentFieldsConfig's
   * userBoundTo fields) so the edit form matches the rest of the app.
   * When undefined, falls back to the parents i18n namespace.
   */
  labels?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tDossier = useTranslations("dossierForms");
  const [state, formAction, pending] = useActionState<ParentFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={labels?.firstName ?? t("fieldFirstName")}
          htmlFor="firstName"
          required
          error={state.errors?.firstName}
        >
          <Input id="firstName" name="firstName" defaultValue={initial.firstName} required />
        </Field>
        <Field
          label={labels?.lastName ?? t("fieldLastName")}
          htmlFor="lastName"
          required
          error={state.errors?.lastName}
        >
          <Input id="lastName" name="lastName" defaultValue={initial.lastName} required />
        </Field>
      </FormRow>

      <Field
        label={labels?.email ?? t("fieldEmail")}
        htmlFor="email"
        required
        error={state.errors?.email === "exists" ? t("emailExists") : state.errors?.email}
      >
        <Input id="email" name="email" type="email" defaultValue={initial.email} required />
      </Field>

      <FormRow>
        <Field label={t("fieldRelation")} htmlFor="relation">
          <Select id="relation" name="relation" defaultValue={initial.relation}>
            <option value="">—</option>
            {RESPONSABLE_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {tDossier(`responsable.relations.${r}` as never)}
              </option>
            ))}
          </Select>
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
