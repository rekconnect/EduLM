"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { type FieldDef } from "@/lib/entity-fields";
import { type ParentCreateConfig } from "@/lib/parent-create-config";
import { createParent, type ParentFormState } from "../_actions";

/**
 * The "Add a parent" form is now data-driven by Tenant.parentCreateFieldsConfig.
 * - email + password are always rendered (auth necessity).
 * - firstName, lastName, relation, locale are rendered only when the
 *   tenant's config doesn't set them to "hidden". Their `required`
 *   attribute mirrors the configured mode.
 * - Any custom fields are rendered after the standard block, with names
 *   prefixed by "f-" so the server action can pull them out and write
 *   them into User.customAnswers.
 */
export function CreateParentForm({ config }: { config: ParentCreateConfig }) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<ParentFormState, FormData>(
    createParent,
    {},
  );

  const showFirstName = config.builtin.firstName !== "hidden";
  const showLastName = config.builtin.lastName !== "hidden";
  const showRelation = config.builtin.relation !== "hidden";
  const showLocale = config.builtin.locale !== "hidden";

  const sortedFields = [...config.fields]
    .filter((f) => f.active !== false)
    .sort((a, b) => a.order - b.order);

  return (
    <form action={formAction} className="space-y-5">
      {(showFirstName || showLastName) && (
        <FormRow>
          {showFirstName ? (
            <Field
              label={t("fieldFirstName")}
              htmlFor="firstName"
              required={config.builtin.firstName === "required"}
              error={state.errors?.firstName}
            >
              <Input
                id="firstName"
                name="firstName"
                required={config.builtin.firstName === "required"}
                autoFocus
              />
            </Field>
          ) : null}
          {showLastName ? (
            <Field
              label={t("fieldLastName")}
              htmlFor="lastName"
              required={config.builtin.lastName === "required"}
              error={state.errors?.lastName}
            >
              <Input
                id="lastName"
                name="lastName"
                required={config.builtin.lastName === "required"}
              />
            </Field>
          ) : null}
        </FormRow>
      )}

      <Field
        label={t("fieldEmail")}
        htmlFor="email"
        required
        error={state.errors?.email === "exists" ? t("emailExists") : state.errors?.email}
      >
        <Input id="email" name="email" type="email" required />
      </Field>

      {(showRelation || showLocale) && (
        <FormRow>
          {showRelation ? (
            <Field
              label={t("fieldRelation")}
              htmlFor="relation"
              required={config.builtin.relation === "required"}
            >
              <Input
                id="relation"
                name="relation"
                required={config.builtin.relation === "required"}
                placeholder="père / mère / tuteur"
              />
            </Field>
          ) : null}
          {showLocale ? (
            <Field
              label={t("fieldLocale")}
              htmlFor="locale"
              required={config.builtin.locale === "required"}
            >
              <Select id="locale" name="locale" defaultValue="fr">
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </Select>
            </Field>
          ) : null}
        </FormRow>
      )}

      <Field
        label={t("fieldPassword")}
        htmlFor="password"
        required
        hint={t("fieldPasswordHint")}
        error={state.errors?.password}
      >
        <Input id="password" name="password" type="text" required minLength={8} />
      </Field>

      {sortedFields.length > 0 ? (
        <div className="space-y-4 border-t border-[color:var(--color-border-subtle)] pt-5">
          {sortedFields.map((f) => (
            <CustomFieldInput key={f.id} field={f} error={state.errors?.[`f-${f.id}`]} />
          ))}
        </div>
      ) : null}

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

function CustomFieldInput({
  field,
  error,
}: {
  field: FieldDef;
  error?: string;
}) {
  const name = `f-${field.id}`;
  const common = {
    id: name,
    name,
    required: field.required,
  };

  let control: React.ReactNode;
  switch (field.type) {
    case "long_text":
      control = <Textarea {...common} rows={3} />;
      break;
    case "select":
      control = (
        <Select {...common} defaultValue="">
          <option value="" disabled>
            —
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      );
      break;
    case "yes_no":
      control = (
        <Select {...common} defaultValue="">
          <option value="" disabled>
            —
          </option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </Select>
      );
      break;
    case "date":
      control = <Input {...common} type="date" />;
      break;
    case "number":
      control = <Input {...common} type="number" inputMode="numeric" />;
      break;
    case "phone":
      control = <Input {...common} type="tel" inputMode="tel" />;
      break;
    case "email":
      control = <Input {...common} type="email" inputMode="email" />;
      break;
    case "short_text":
    default:
      control = <Input {...common} />;
  }

  return (
    <Field
      label={field.label || field.key}
      htmlFor={name}
      required={field.required}
      hint={field.hint}
      error={error}
    >
      {control}
    </Field>
  );
}
