"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createParent, type ParentFormState } from "../_actions";

export function CreateParentForm() {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<ParentFormState, FormData>(
    createParent,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("fieldFirstName")}
          htmlFor="firstName"
          required
          error={state.errors?.firstName}
        >
          <Input id="firstName" name="firstName" required autoFocus />
        </Field>
        <Field
          label={t("fieldLastName")}
          htmlFor="lastName"
          required
          error={state.errors?.lastName}
        >
          <Input id="lastName" name="lastName" required />
        </Field>
      </FormRow>

      <Field
        label={t("fieldEmail")}
        htmlFor="email"
        required
        error={state.errors?.email === "exists" ? t("emailExists") : state.errors?.email}
      >
        <Input id="email" name="email" type="email" required />
      </Field>

      <FormRow>
        <Field label={t("fieldRelation")} htmlFor="relation">
          <Input id="relation" name="relation" placeholder="père / mère / tuteur" />
        </Field>
        <Field label={t("fieldLocale")} htmlFor="locale">
          <Select id="locale" name="locale" defaultValue="fr">
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </Field>
      </FormRow>

      <Field
        label={t("fieldPassword")}
        htmlFor="password"
        required
        hint={t("fieldPasswordHint")}
        error={state.errors?.password}
      >
        <Input id="password" name="password" type="text" required minLength={8} />
      </Field>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/admin/parents"
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          {tCommon("cancel")}
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
