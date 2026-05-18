"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createAnnouncement, type AnnouncementFormState } from "../_actions";

type Audience = "ALL_PARENTS" | "CLASS" | "ACADEMIC_YEAR";

export function AnnouncementForm({
  classes,
  years,
}: {
  classes: { id: string; name: string }[];
  years: { id: string; label: string; isActive: boolean }[];
}) {
  const t = useTranslations("communication");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<AnnouncementFormState, FormData>(
    createAnnouncement,
    {},
  );
  const [audience, setAudience] = useState<Audience>("ALL_PARENTS");

  return (
    <form action={formAction} className="space-y-5">
      <Field label={t("fieldTitle")} htmlFor="title" required error={state.errors?.title}>
        <Input id="title" name="title" required autoFocus />
      </Field>

      <Field label={t("fieldBody")} htmlFor="body" required error={state.errors?.body}>
        <Textarea id="body" name="body" rows={6} required />
      </Field>

      <FormRow>
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
        {audience === "CLASS" ? (
          <Field label={t("fieldClass")} htmlFor="classId" required error={state.errors?.classId}>
            <Select id="classId" name="classId" defaultValue="" required>
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
        ) : audience === "ACADEMIC_YEAR" ? (
          <Field label={t("fieldYear")} htmlFor="academicYearId" required error={state.errors?.academicYearId}>
            <Select id="academicYearId" name="academicYearId" defaultValue="" required>
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
        ) : (
          <span />
        )}
      </FormRow>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/admin/announcements"
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
