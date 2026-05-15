"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { TenantFormState } from "./_actions";

const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export function TenantForm({
  action,
  submitLabel,
}: {
  action: (state: TenantFormState, formData: FormData) => Promise<TenantFormState>;
  submitLabel: string;
}) {
  const t = useTranslations("tenants");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<TenantFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("fieldSlug")}
          htmlFor="slug"
          required
          hint={t("fieldSlugHint")}
          error={state.errors?.slug}
        >
          <Input id="slug" name="slug" required pattern="[a-z0-9-]+" autoFocus placeholder="montaigne" />
        </Field>
        <Field label={t("fieldName")} htmlFor="name" required error={state.errors?.name}>
          <Input id="name" name="name" required placeholder="Lycée Montaigne" />
        </Field>
      </FormRow>

      <FormRow>
        <Field
          label={t("fieldDefaultLocale")}
          htmlFor="defaultLocale"
          required
          error={state.errors?.defaultLocale}
        >
          <Select id="defaultLocale" name="defaultLocale" defaultValue="fr">
            {Object.entries(LOCALE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldPlan")} htmlFor="plan" required error={state.errors?.plan}>
          <Select id="plan" name="plan" defaultValue="TRIAL">
            <option value="TRIAL">TRIAL</option>
            <option value="STARTER">STARTER</option>
            <option value="GROWTH">GROWTH</option>
            <option value="CUSTOM">CUSTOM</option>
          </Select>
        </Field>
      </FormRow>

      <Field
        label={t("fieldEnabledLocales")}
        required
        error={state.errors?.enabledLocales as string | undefined}
      >
        <div className="flex flex-wrap gap-3">
          {Object.entries(LOCALE_LABELS).map(([code, label]) => (
            <label
              key={code}
              className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                name="enabledLocales"
                value={code}
                defaultChecked={code === "fr"}
              />
              {label}
            </label>
          ))}
        </div>
      </Field>

      <div className="mt-6 rounded-lg border border-[color:var(--border)] bg-[color:var(--muted)] p-4">
        <h3 className="mb-3 text-sm font-semibold">School admin account</h3>
        <FormRow>
          <Field label="Admin name" htmlFor="adminName" required error={state.errors?.adminName}>
            <Input id="adminName" name="adminName" required />
          </Field>
          <Field label="Admin email" htmlFor="adminEmail" required error={state.errors?.adminEmail}>
            <Input id="adminEmail" name="adminEmail" type="email" required />
          </Field>
        </FormRow>
        <div className="mt-4">
          <Field
            label="Temporary password (min 8 chars)"
            htmlFor="adminPassword"
            required
            error={state.errors?.adminPassword}
          >
            <Input id="adminPassword" name="adminPassword" type="text" required minLength={8} />
          </Field>
        </div>
      </div>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/super-admin"
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          {tCommon("cancel")}
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
