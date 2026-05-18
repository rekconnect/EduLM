"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import {
  saveIdentityStep,
  saveFamilyStep,
  saveAcademicStep,
  type StepFormState,
} from "../../_actions";

type StepAction = (
  state: StepFormState,
  formData: FormData,
) => Promise<StepFormState>;

export function IdentityStepForm({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: {
    childFirstName: string;
    childLastName: string;
    childDob: string;
    childGender: string;
    childNationality: string;
    childPlaceOfBirth: string;
  };
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const action: StepAction = saveIdentityStep.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<StepFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label={t("fieldChildFirstName")} htmlFor="childFirstName" required error={state.errors?.childFirstName}>
          <Input id="childFirstName" name="childFirstName" defaultValue={initial.childFirstName} required autoFocus />
        </Field>
        <Field label={t("fieldChildLastName")} htmlFor="childLastName" required error={state.errors?.childLastName}>
          <Input id="childLastName" name="childLastName" defaultValue={initial.childLastName} required />
        </Field>
      </FormRow>
      <FormRow>
        <Field label={t("fieldChildDob")} htmlFor="childDob" error={state.errors?.childDob}>
          <Input id="childDob" name="childDob" type="date" defaultValue={initial.childDob} />
        </Field>
        <Field label={t("fieldChildGender")} htmlFor="childGender" error={state.errors?.childGender}>
          <Select id="childGender" name="childGender" defaultValue={initial.childGender}>
            <option value="">—</option>
            <option value="MALE">{t("genderMale")}</option>
            <option value="FEMALE">{t("genderFemale")}</option>
            <option value="OTHER">{t("genderOther")}</option>
          </Select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label={t("fieldChildNationality")} htmlFor="childNationality" error={state.errors?.childNationality}>
          <Input id="childNationality" name="childNationality" defaultValue={initial.childNationality} />
        </Field>
        <Field label={t("fieldChildPlaceOfBirth")} htmlFor="childPlaceOfBirth" error={state.errors?.childPlaceOfBirth}>
          <Input id="childPlaceOfBirth" name="childPlaceOfBirth" defaultValue={initial.childPlaceOfBirth} />
        </Field>
      </FormRow>

      <StepFooter pending={pending} nextLabel={t("stepNext")} prevLabel={null} />
      {state.formError ? <p className="text-sm text-red-600">{tCommon("loading")}</p> : null}
    </form>
  );
}

export function FamilyStepForm({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: {
    primaryParentName: string;
    primaryParentPhone: string;
    primaryParentEmail: string;
    secondaryParentName: string;
    secondaryParentPhone: string;
    secondaryParentEmail: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
}) {
  const t = useTranslations("admissions");
  const action: StepAction = saveFamilyStep.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<StepFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label={t("fieldPrimaryParentName")} htmlFor="primaryParentName" required error={state.errors?.primaryParentName}>
          <Input id="primaryParentName" name="primaryParentName" defaultValue={initial.primaryParentName} required autoFocus />
        </Field>
        <Field label={t("fieldPrimaryParentPhone")} htmlFor="primaryParentPhone" error={state.errors?.primaryParentPhone}>
          <Input id="primaryParentPhone" name="primaryParentPhone" type="tel" defaultValue={initial.primaryParentPhone} />
        </Field>
      </FormRow>
      <Field label={t("fieldPrimaryParentEmail")} htmlFor="primaryParentEmail" error={state.errors?.primaryParentEmail}>
        <Input id="primaryParentEmail" name="primaryParentEmail" type="email" defaultValue={initial.primaryParentEmail} />
      </Field>

      <hr className="border-[color:var(--border)]" />

      <FormRow>
        <Field label={t("fieldSecondaryParentName")} htmlFor="secondaryParentName" error={state.errors?.secondaryParentName}>
          <Input id="secondaryParentName" name="secondaryParentName" defaultValue={initial.secondaryParentName} />
        </Field>
        <Field label={t("fieldSecondaryParentPhone")} htmlFor="secondaryParentPhone" error={state.errors?.secondaryParentPhone}>
          <Input id="secondaryParentPhone" name="secondaryParentPhone" type="tel" defaultValue={initial.secondaryParentPhone} />
        </Field>
      </FormRow>
      <Field label={t("fieldSecondaryParentEmail")} htmlFor="secondaryParentEmail" error={state.errors?.secondaryParentEmail}>
        <Input id="secondaryParentEmail" name="secondaryParentEmail" type="email" defaultValue={initial.secondaryParentEmail} />
      </Field>

      <hr className="border-[color:var(--border)]" />

      <Field label={t("fieldAddress")} htmlFor="address" error={state.errors?.address}>
        <Input id="address" name="address" defaultValue={initial.address} />
      </Field>
      <FormRow>
        <Field label={t("fieldCity")} htmlFor="city" error={state.errors?.city}>
          <Input id="city" name="city" defaultValue={initial.city} />
        </Field>
        <Field label={t("fieldPostalCode")} htmlFor="postalCode" error={state.errors?.postalCode}>
          <Input id="postalCode" name="postalCode" defaultValue={initial.postalCode} />
        </Field>
      </FormRow>
      <Field label={t("fieldCountry")} htmlFor="country" error={state.errors?.country}>
        <Input id="country" name="country" defaultValue={initial.country} />
      </Field>

      <StepFooter
        pending={pending}
        nextLabel={t("stepNext")}
        prevLabel={t("stepPrev")}
        prevHref={`/parent/applications/${applicationId}/edit?step=1`}
      />
    </form>
  );
}

export function AcademicStepForm({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: {
    currentSchool: string;
    currentLevel: string;
    requestedLevel: string;
    motivationNote: string;
  };
}) {
  const t = useTranslations("admissions");
  const action: StepAction = saveAcademicStep.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<StepFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label={t("fieldCurrentSchool")} htmlFor="currentSchool" error={state.errors?.currentSchool}>
          <Input id="currentSchool" name="currentSchool" defaultValue={initial.currentSchool} autoFocus />
        </Field>
        <Field label={t("fieldCurrentLevel")} htmlFor="currentLevel" error={state.errors?.currentLevel}>
          <Input id="currentLevel" name="currentLevel" defaultValue={initial.currentLevel} placeholder="CM2, 6ème…" />
        </Field>
      </FormRow>
      <Field label={t("fieldRequestedLevel")} htmlFor="requestedLevel" required error={state.errors?.requestedLevel}>
        <Input id="requestedLevel" name="requestedLevel" defaultValue={initial.requestedLevel} required placeholder="6ème, Seconde…" />
      </Field>
      <Field label={t("fieldMotivation")} htmlFor="motivationNote" error={state.errors?.motivationNote}>
        <Textarea id="motivationNote" name="motivationNote" defaultValue={initial.motivationNote} rows={4} />
      </Field>

      <StepFooter
        pending={pending}
        nextLabel={t("stepNext")}
        prevLabel={t("stepPrev")}
        prevHref={`/parent/applications/${applicationId}/edit?step=2`}
      />
    </form>
  );
}

function StepFooter({
  pending,
  nextLabel,
  prevLabel,
  prevHref,
}: {
  pending: boolean;
  nextLabel: string;
  prevLabel: string | null;
  prevHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      {prevLabel && prevHref ? (
        <a
          href={prevHref}
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          ← {prevLabel}
        </a>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "…" : nextLabel}
      </Button>
    </div>
  );
}
