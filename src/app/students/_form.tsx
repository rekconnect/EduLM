"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { StudentFormState } from "./_actions";

type StudentValues = {
  firstName?: string;
  lastName?: string;
  dob?: string | null;
  status?: "PROSPECT" | "ENROLLED" | "WITHDRAWN" | "GRADUATED";
  gender?: "MALE" | "FEMALE" | "OTHER" | "";
  nationality?: string | null;
  placeOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  previousSchool?: string | null;
  emergencyContact?: string | null;
  internalNotes?: string | null;
};

export function StudentForm({
  action,
  initial,
  submitLabel,
}: {
  action: (state: StudentFormState, formData: FormData) => Promise<StudentFormState>;
  initial?: StudentValues;
  submitLabel: string;
}) {
  const t = useTranslations("students");
  const tAdm = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [state, formAction, pending] = useActionState<StudentFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-8">
      {/* Identity ─────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">
          {tAdm("stepIdentity")}
        </h3>
        <div className="space-y-4">
          <FormRow>
            <Field
              label={t("fieldFirstName")}
              htmlFor="firstName"
              required
              error={state.errors?.firstName}
            >
              <Input
                id="firstName"
                name="firstName"
                defaultValue={initial?.firstName ?? ""}
                required
                autoFocus
              />
            </Field>
            <Field
              label={t("fieldLastName")}
              htmlFor="lastName"
              required
              error={state.errors?.lastName}
            >
              <Input
                id="lastName"
                name="lastName"
                defaultValue={initial?.lastName ?? ""}
                required
              />
            </Field>
          </FormRow>

          <FormRow>
            <Field label={t("fieldDob")} htmlFor="dob" error={state.errors?.dob}>
              <Input
                id="dob"
                name="dob"
                type="date"
                defaultValue={initial?.dob ?? ""}
              />
            </Field>
            <Field label={tAdm("fieldChildGender")} htmlFor="gender" error={state.errors?.gender}>
              <Select id="gender" name="gender" defaultValue={initial?.gender ?? ""}>
                <option value="">—</option>
                <option value="MALE">{tAdm("genderMale")}</option>
                <option value="FEMALE">{tAdm("genderFemale")}</option>
                <option value="OTHER">{tAdm("genderOther")}</option>
              </Select>
            </Field>
          </FormRow>

          <FormRow>
            <Field
              label={tAdm("fieldChildNationality")}
              htmlFor="nationality"
              error={state.errors?.nationality}
            >
              <Input
                id="nationality"
                name="nationality"
                defaultValue={initial?.nationality ?? ""}
              />
            </Field>
            <Field
              label={tAdm("fieldChildPlaceOfBirth")}
              htmlFor="placeOfBirth"
              error={state.errors?.placeOfBirth}
            >
              <Input
                id="placeOfBirth"
                name="placeOfBirth"
                defaultValue={initial?.placeOfBirth ?? ""}
              />
            </Field>
          </FormRow>

          <Field label={t("fieldStatus")} htmlFor="status" error={state.errors?.status} required>
            <Select id="status" name="status" defaultValue={initial?.status ?? "PROSPECT"}>
              <option value="PROSPECT">{t("statusProspect")}</option>
              <option value="ENROLLED">{t("statusEnrolled")}</option>
              <option value="WITHDRAWN">{t("statusWithdrawn")}</option>
              <option value="GRADUATED">{t("statusGraduated")}</option>
            </Select>
          </Field>
        </div>
      </section>

      {/* Address ─────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">
          {tAdm("fieldAddress")}
        </h3>
        <div className="space-y-4">
          <Field label={tAdm("fieldAddress")} htmlFor="address" error={state.errors?.address}>
            <Input id="address" name="address" defaultValue={initial?.address ?? ""} />
          </Field>
          <FormRow>
            <Field label={tAdm("fieldCity")} htmlFor="city" error={state.errors?.city}>
              <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
            </Field>
            <Field label={tAdm("fieldPostalCode")} htmlFor="postalCode" error={state.errors?.postalCode}>
              <Input
                id="postalCode"
                name="postalCode"
                defaultValue={initial?.postalCode ?? ""}
              />
            </Field>
          </FormRow>
          <Field label={tAdm("fieldCountry")} htmlFor="country" error={state.errors?.country}>
            <Input id="country" name="country" defaultValue={initial?.country ?? ""} />
          </Field>
        </div>
      </section>

      {/* Background ──────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">
          {t("sectionBackground")}
        </h3>
        <div className="space-y-4">
          <Field
            label={t("fieldPreviousSchool")}
            htmlFor="previousSchool"
            error={state.errors?.previousSchool}
          >
            <Input
              id="previousSchool"
              name="previousSchool"
              defaultValue={initial?.previousSchool ?? ""}
            />
          </Field>
          <Field
            label={t("fieldEmergencyContact")}
            htmlFor="emergencyContact"
            hint={t("fieldEmergencyContactHint")}
            error={state.errors?.emergencyContact}
          >
            <Input
              id="emergencyContact"
              name="emergencyContact"
              defaultValue={initial?.emergencyContact ?? ""}
            />
          </Field>
        </div>
      </section>

      {/* Internal notes (admin-only) ─────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">
          {t("sectionInternal")}
        </h3>
        <Field
          label={t("fieldInternalNotes")}
          htmlFor="internalNotes"
          hint={t("fieldInternalNotesHint")}
          error={state.errors?.internalNotes}
        >
          <Textarea
            id="internalNotes"
            name="internalNotes"
            rows={4}
            defaultValue={initial?.internalNotes ?? ""}
          />
        </Field>
      </section>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {tErrors("generic")}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-[color:var(--border)] pt-4">
        <a
          href="/students"
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
