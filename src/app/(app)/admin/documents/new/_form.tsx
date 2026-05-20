"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createDocument, type DocumentFormState } from "../_actions";

type Audience = "ALL_PARENTS" | "CLASS" | "ACADEMIC_YEAR";

export function DocumentForm({
  classes,
  years,
  storageEnabled,
}: {
  classes: { id: string; name: string }[];
  years: { id: string; label: string; isActive: boolean }[];
  storageEnabled: boolean;
}) {
  const t = useTranslations("documents");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<DocumentFormState, FormData>(
    createDocument,
    {},
  );
  const [audience, setAudience] = useState<Audience>("ALL_PARENTS");

  return (
    <form action={formAction} className="space-y-5" encType="multipart/form-data">
      <Field label={t("fieldTitle")} htmlFor="title" required error={state.errors?.title}>
        <Input id="title" name="title" required autoFocus />
      </Field>

      <Field label={t("fieldDescription")} htmlFor="description">
        <Textarea id="description" name="description" rows={3} />
      </Field>

      <FormRow>
        <Field label={t("fieldCategory")} htmlFor="category" required>
          <Select id="category" name="category" defaultValue="OTHER">
            <option value="REGULATION">{t("categoryRegulation")}</option>
            <option value="CALENDAR">{t("categoryCalendar")}</option>
            <option value="FORM">{t("categoryForm")}</option>
            <option value="NEWSLETTER">{t("categoryNewsletter")}</option>
            <option value="OTHER">{t("categoryOther")}</option>
          </Select>
        </Field>
        <Field label={t("fieldAudience")} htmlFor="audience" required>
          <Select
            id="audience"
            name="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
          >
            <option value="ALL_PARENTS">{t("audienceAll")}</option>
            <option value="CLASS">{t("audienceClass")}</option>
            <option value="ACADEMIC_YEAR">{t("audienceYear")}</option>
          </Select>
        </Field>
      </FormRow>

      {audience === "CLASS" ? (
        <Field label={t("fieldClass")} htmlFor="classId" required error={state.errors?.classId}>
          <Select id="classId" name="classId" defaultValue="">
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
      ) : null}

      {audience === "ACADEMIC_YEAR" ? (
        <Field label={t("fieldYear")} htmlFor="academicYearId" required error={state.errors?.academicYearId}>
          <Select id="academicYearId" name="academicYearId" defaultValue="">
            <option value="" disabled>
              —
            </option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.isActive ? " (active)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="rounded-md border border-[color:var(--border)] p-4">
        <Field
          label={t("fieldFile")}
          htmlFor="file"
          hint={storageEnabled ? t("uploadHint") : t("noStorage")}
          error={state.errors?.file === "either-file-or-url" ? "—" : state.errors?.file}
        >
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/*,text/*"
            disabled={!storageEnabled}
          />
        </Field>
        <div className="mt-3">
          <Field label={t("fieldExternalUrl")} htmlFor="externalUrl" error={state.errors?.externalUrl}>
            <Input
              id="externalUrl"
              name="externalUrl"
              type="url"
              placeholder="https://drive.google.com/..."
            />
          </Field>
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresAck" />
        <span>{t("fieldRequiresAck")}</span>
      </label>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError === "no-storage" ? t("noStorage") : state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/admin/documents"
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
