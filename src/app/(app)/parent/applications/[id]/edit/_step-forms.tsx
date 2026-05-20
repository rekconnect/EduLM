"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import {
  getFieldLabel,
  getFieldVisibility,
  orderedFieldsForStep,
  type CustomQuestion,
  type CycleFieldConfig,
  type FieldVisibility,
} from "@/lib/admission-fields";
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

/** Returns a fast visibility lookup for the given step's cycle config. */
function makeVisFn(config: CycleFieldConfig) {
  return (key: string): FieldVisibility => getFieldVisibility(config, key);
}

/** Pairs ordered keys into 2-column rows for the existing visual layout. */
function chunkRows<T>(items: T[], size = 2): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Identity step ──────────────────────────────────────────

export function IdentityStepForm({
  applicationId,
  initial,
  fieldConfig,
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
  fieldConfig: CycleFieldConfig;
}) {
  const t = useTranslations("admissions");
  const action: StepAction = saveIdentityStep.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<StepFormState, FormData>(action, {});
  const vis = makeVisFn(fieldConfig);

  const rendered: Record<string, ReactNode> = {
    childFirstName: (
      <Field
        key="childFirstName"
        label={getFieldLabel(fieldConfig, "childFirstName", t("fieldChildFirstName"))}
        htmlFor="childFirstName"
        required={vis("childFirstName") === "required"}
        error={state.errors?.childFirstName}
      >
        <Input
          id="childFirstName"
          name="childFirstName"
          defaultValue={initial.childFirstName}
          required={vis("childFirstName") === "required"}
          autoFocus
        />
      </Field>
    ),
    childLastName: (
      <Field
        key="childLastName"
        label={getFieldLabel(fieldConfig, "childLastName", t("fieldChildLastName"))}
        htmlFor="childLastName"
        required={vis("childLastName") === "required"}
        error={state.errors?.childLastName}
      >
        <Input
          id="childLastName"
          name="childLastName"
          defaultValue={initial.childLastName}
          required={vis("childLastName") === "required"}
        />
      </Field>
    ),
    childDob: (
      <Field
        key="childDob"
        label={getFieldLabel(fieldConfig, "childDob", t("fieldChildDob"))}
        htmlFor="childDob"
        required={vis("childDob") === "required"}
        error={state.errors?.childDob}
      >
        <Input
          id="childDob"
          name="childDob"
          type="date"
          defaultValue={initial.childDob}
          required={vis("childDob") === "required"}
        />
      </Field>
    ),
    childGender: (
      <Field
        key="childGender"
        label={getFieldLabel(fieldConfig, "childGender", t("fieldChildGender"))}
        htmlFor="childGender"
        required={vis("childGender") === "required"}
        error={state.errors?.childGender}
      >
        <Select
          id="childGender"
          name="childGender"
          defaultValue={initial.childGender}
          required={vis("childGender") === "required"}
        >
          <option value="">—</option>
          <option value="MALE">{t("genderMale")}</option>
          <option value="FEMALE">{t("genderFemale")}</option>
          <option value="OTHER">{t("genderOther")}</option>
        </Select>
      </Field>
    ),
    childNationality: (
      <Field
        key="childNationality"
        label={getFieldLabel(fieldConfig, "childNationality", t("fieldChildNationality"))}
        htmlFor="childNationality"
        required={vis("childNationality") === "required"}
        error={state.errors?.childNationality}
      >
        <Input
          id="childNationality"
          name="childNationality"
          defaultValue={initial.childNationality}
          required={vis("childNationality") === "required"}
        />
      </Field>
    ),
    childPlaceOfBirth: (
      <Field
        key="childPlaceOfBirth"
        label={getFieldLabel(fieldConfig, "childPlaceOfBirth", t("fieldChildPlaceOfBirth"))}
        htmlFor="childPlaceOfBirth"
        required={vis("childPlaceOfBirth") === "required"}
        error={state.errors?.childPlaceOfBirth}
      >
        <Input
          id="childPlaceOfBirth"
          name="childPlaceOfBirth"
          defaultValue={initial.childPlaceOfBirth}
          required={vis("childPlaceOfBirth") === "required"}
        />
      </Field>
    ),
  };

  const visibleKeys = orderedFieldsForStep("identity", fieldConfig)
    .map((f) => f.key)
    .filter((k) => vis(k) !== "hidden");

  return (
    <form action={formAction} className="space-y-5">
      {chunkRows(visibleKeys).map((row, i) => (
        <FormRow key={i}>{row.map((k) => rendered[k])}</FormRow>
      ))}
      <StepFooter pending={pending} nextLabel={t("stepNext")} prevLabel={null} />
    </form>
  );
}

// ─── Family step ────────────────────────────────────────────

export function FamilyStepForm({
  applicationId,
  initial,
  fieldConfig,
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
  fieldConfig: CycleFieldConfig;
}) {
  const t = useTranslations("admissions");
  const action: StepAction = saveFamilyStep.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<StepFormState, FormData>(action, {});
  const vis = makeVisFn(fieldConfig);

  const rendered: Record<string, ReactNode> = {
    primaryParentName: (
      <Field
        key="primaryParentName"
        label={getFieldLabel(fieldConfig, "primaryParentName", t("fieldPrimaryParentName"))}
        htmlFor="primaryParentName"
        required={vis("primaryParentName") === "required"}
        error={state.errors?.primaryParentName}
      >
        <Input
          id="primaryParentName"
          name="primaryParentName"
          defaultValue={initial.primaryParentName}
          required={vis("primaryParentName") === "required"}
          autoFocus
        />
      </Field>
    ),
    primaryParentPhone: (
      <Field
        key="primaryParentPhone"
        label={getFieldLabel(fieldConfig, "primaryParentPhone", t("fieldPrimaryParentPhone"))}
        htmlFor="primaryParentPhone"
        required={vis("primaryParentPhone") === "required"}
        error={state.errors?.primaryParentPhone}
      >
        <Input
          id="primaryParentPhone"
          name="primaryParentPhone"
          type="tel"
          defaultValue={initial.primaryParentPhone}
          required={vis("primaryParentPhone") === "required"}
        />
      </Field>
    ),
    primaryParentEmail: (
      <Field
        key="primaryParentEmail"
        label={getFieldLabel(fieldConfig, "primaryParentEmail", t("fieldPrimaryParentEmail"))}
        htmlFor="primaryParentEmail"
        required={vis("primaryParentEmail") === "required"}
        error={state.errors?.primaryParentEmail}
      >
        <Input
          id="primaryParentEmail"
          name="primaryParentEmail"
          type="email"
          defaultValue={initial.primaryParentEmail}
          required={vis("primaryParentEmail") === "required"}
        />
      </Field>
    ),
    secondaryParentName: (
      <Field
        key="secondaryParentName"
        label={getFieldLabel(fieldConfig, "secondaryParentName", t("fieldSecondaryParentName"))}
        htmlFor="secondaryParentName"
        required={vis("secondaryParentName") === "required"}
        error={state.errors?.secondaryParentName}
      >
        <Input
          id="secondaryParentName"
          name="secondaryParentName"
          defaultValue={initial.secondaryParentName}
          required={vis("secondaryParentName") === "required"}
        />
      </Field>
    ),
    secondaryParentPhone: (
      <Field
        key="secondaryParentPhone"
        label={getFieldLabel(fieldConfig, "secondaryParentPhone", t("fieldSecondaryParentPhone"))}
        htmlFor="secondaryParentPhone"
        required={vis("secondaryParentPhone") === "required"}
        error={state.errors?.secondaryParentPhone}
      >
        <Input
          id="secondaryParentPhone"
          name="secondaryParentPhone"
          type="tel"
          defaultValue={initial.secondaryParentPhone}
          required={vis("secondaryParentPhone") === "required"}
        />
      </Field>
    ),
    secondaryParentEmail: (
      <Field
        key="secondaryParentEmail"
        label={getFieldLabel(fieldConfig, "secondaryParentEmail", t("fieldSecondaryParentEmail"))}
        htmlFor="secondaryParentEmail"
        required={vis("secondaryParentEmail") === "required"}
        error={state.errors?.secondaryParentEmail}
      >
        <Input
          id="secondaryParentEmail"
          name="secondaryParentEmail"
          type="email"
          defaultValue={initial.secondaryParentEmail}
          required={vis("secondaryParentEmail") === "required"}
        />
      </Field>
    ),
    address: (
      <Field
        key="address"
        label={getFieldLabel(fieldConfig, "address", t("fieldAddress"))}
        htmlFor="address"
        required={vis("address") === "required"}
        error={state.errors?.address}
      >
        <Input
          id="address"
          name="address"
          defaultValue={initial.address}
          required={vis("address") === "required"}
        />
      </Field>
    ),
    city: (
      <Field
        key="city"
        label={getFieldLabel(fieldConfig, "city", t("fieldCity"))}
        htmlFor="city"
        required={vis("city") === "required"}
        error={state.errors?.city}
      >
        <Input
          id="city"
          name="city"
          defaultValue={initial.city}
          required={vis("city") === "required"}
        />
      </Field>
    ),
    postalCode: (
      <Field
        key="postalCode"
        label={getFieldLabel(fieldConfig, "postalCode", t("fieldPostalCode"))}
        htmlFor="postalCode"
        required={vis("postalCode") === "required"}
        error={state.errors?.postalCode}
      >
        <Input
          id="postalCode"
          name="postalCode"
          defaultValue={initial.postalCode}
          required={vis("postalCode") === "required"}
        />
      </Field>
    ),
    country: (
      <Field
        key="country"
        label={getFieldLabel(fieldConfig, "country", t("fieldCountry"))}
        htmlFor="country"
        required={vis("country") === "required"}
        error={state.errors?.country}
      >
        <Input
          id="country"
          name="country"
          defaultValue={initial.country}
          required={vis("country") === "required"}
        />
      </Field>
    ),
  };

  // Group keys for section dividers — derived from the registry.
  const primaryGroup = ["primaryParentName", "primaryParentPhone", "primaryParentEmail"];
  const secondaryGroup = ["secondaryParentName", "secondaryParentPhone", "secondaryParentEmail"];
  const addressGroup = ["address", "city", "postalCode", "country"];

  const ordered = orderedFieldsForStep("family", fieldConfig)
    .map((f) => f.key)
    .filter((k) => vis(k) !== "hidden");

  // Bucket ordered visible keys into the three groups, preserving the
  // configured order within each group.
  const buckets: { primary: string[]; secondary: string[]; address: string[] } = {
    primary: [],
    secondary: [],
    address: [],
  };
  for (const k of ordered) {
    if (primaryGroup.includes(k)) buckets.primary.push(k);
    else if (secondaryGroup.includes(k)) buckets.secondary.push(k);
    else if (addressGroup.includes(k)) buckets.address.push(k);
  }

  return (
    <form action={formAction} className="space-y-5">
      {chunkRows(buckets.primary).map((row, i) => (
        <FormRow key={`p-${i}`}>{row.map((k) => rendered[k])}</FormRow>
      ))}

      {buckets.secondary.length > 0 ? (
        <>
          <hr className="border-[color:var(--color-border-subtle)]" />
          {chunkRows(buckets.secondary).map((row, i) => (
            <FormRow key={`s-${i}`}>{row.map((k) => rendered[k])}</FormRow>
          ))}
        </>
      ) : null}

      {buckets.address.length > 0 ? (
        <>
          <hr className="border-[color:var(--color-border-subtle)]" />
          {chunkRows(buckets.address).map((row, i) => (
            <FormRow key={`a-${i}`}>{row.map((k) => rendered[k])}</FormRow>
          ))}
        </>
      ) : null}

      <StepFooter
        pending={pending}
        nextLabel={t("stepNext")}
        prevLabel={t("stepPrev")}
        prevHref={`/parent/applications/${applicationId}/edit?step=1`}
      />
    </form>
  );
}

// ─── Academic step ──────────────────────────────────────────

export function AcademicStepForm({
  applicationId,
  availableLevels,
  targetYearLabel,
  initial,
  fieldConfig,
  customQuestions,
  initialAnswers,
}: {
  applicationId: string;
  availableLevels: string[];
  targetYearLabel: string;
  initial: {
    currentSchool: string;
    currentLevel: string;
    requestedLevel: string;
    motivationNote: string;
  };
  fieldConfig: CycleFieldConfig;
  customQuestions: CustomQuestion[];
  initialAnswers: Record<string, string>;
}) {
  const t = useTranslations("admissions");
  const action: StepAction = saveAcademicStep.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<StepFormState, FormData>(action, {});
  const vis = makeVisFn(fieldConfig);

  // Preserve a previously-selected requested level even if it's no longer in
  // the dropdown options (e.g., a class was deleted).
  const optionLevels =
    initial.requestedLevel && !availableLevels.includes(initial.requestedLevel)
      ? [initial.requestedLevel, ...availableLevels]
      : availableLevels;

  const requestedLabel = getFieldLabel(
    fieldConfig,
    "requestedLevel",
    t("fieldRequestedLevel"),
  );

  const rendered: Record<string, ReactNode> = {
    currentSchool: (
      <Field
        key="currentSchool"
        label={getFieldLabel(fieldConfig, "currentSchool", t("fieldCurrentSchool"))}
        htmlFor="currentSchool"
        required={vis("currentSchool") === "required"}
        error={state.errors?.currentSchool}
      >
        <Input
          id="currentSchool"
          name="currentSchool"
          defaultValue={initial.currentSchool}
          required={vis("currentSchool") === "required"}
          autoFocus
        />
      </Field>
    ),
    currentLevel: (
      <Field
        key="currentLevel"
        label={getFieldLabel(fieldConfig, "currentLevel", t("fieldCurrentLevel"))}
        htmlFor="currentLevel"
        required={vis("currentLevel") === "required"}
        error={state.errors?.currentLevel}
      >
        <Input
          id="currentLevel"
          name="currentLevel"
          defaultValue={initial.currentLevel}
          required={vis("currentLevel") === "required"}
          placeholder="CM2, 6ème…"
        />
      </Field>
    ),
    requestedLevel:
      optionLevels.length > 0 ? (
        <Field
          key="requestedLevel"
          label={requestedLabel}
          htmlFor="requestedLevel"
          required
          hint={`Niveaux ouverts pour ${targetYearLabel}`}
          error={state.errors?.requestedLevel}
        >
          <Select
            id="requestedLevel"
            name="requestedLevel"
            required
            defaultValue={initial.requestedLevel || ""}
          >
            <option value="" disabled>
              —
            </option>
            {optionLevels.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field
          key="requestedLevel"
          label={requestedLabel}
          htmlFor="requestedLevel"
          required
          hint={`Aucun niveau encore ouvert pour ${targetYearLabel}. Contactez l'établissement.`}
          error={state.errors?.requestedLevel}
        >
          <Input
            id="requestedLevel"
            name="requestedLevel"
            defaultValue={initial.requestedLevel}
            required
            placeholder="6ème, Seconde…"
          />
        </Field>
      ),
    motivationNote: (
      <Field
        key="motivationNote"
        label={getFieldLabel(fieldConfig, "motivationNote", t("fieldMotivation"))}
        htmlFor="motivationNote"
        required={vis("motivationNote") === "required"}
        error={state.errors?.motivationNote}
      >
        <Textarea
          id="motivationNote"
          name="motivationNote"
          defaultValue={initial.motivationNote}
          rows={4}
          required={vis("motivationNote") === "required"}
        />
      </Field>
    ),
  };

  const orderedKeys = orderedFieldsForStep("academic", fieldConfig)
    .map((f) => f.key)
    .filter((k) => k === "requestedLevel" || vis(k) !== "hidden");

  // requestedLevel is locked and must always render — guarantee it's in the list.
  if (!orderedKeys.includes("requestedLevel")) orderedKeys.push("requestedLevel");

  // Keep textarea-shaped fields (motivationNote, requestedLevel when input-mode)
  // full-width by isolating them into their own rows.
  const fullWidth = new Set(["motivationNote", "requestedLevel"]);
  const groups: string[][] = [];
  let buffer: string[] = [];
  for (const key of orderedKeys) {
    if (fullWidth.has(key)) {
      if (buffer.length > 0) {
        groups.push(buffer);
        buffer = [];
      }
      groups.push([key]);
    } else {
      buffer.push(key);
      if (buffer.length === 2) {
        groups.push(buffer);
        buffer = [];
      }
    }
  }
  if (buffer.length > 0) groups.push(buffer);

  return (
    <form action={formAction} className="space-y-5">
      {groups.map((row, i) =>
        row.length === 1 ? (
          <div key={i}>{rendered[row[0]!]}</div>
        ) : (
          <FormRow key={i}>{row.map((k) => rendered[k])}</FormRow>
        ),
      )}

      {customQuestions.length > 0 ? (
        <>
          <hr className="border-[color:var(--color-border-subtle)]" />
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
            {t("customQuestionsParentHeading")}
          </p>
          {customQuestions.map((q) => (
            <CustomQuestionField
              key={q.id}
              question={q}
              initialValue={initialAnswers[q.id] ?? ""}
              error={state.errors?.[`question:${q.id}`]}
            />
          ))}
        </>
      ) : null}

      <StepFooter
        pending={pending}
        nextLabel={t("stepNext")}
        prevLabel={t("stepPrev")}
        prevHref={`/parent/applications/${applicationId}/edit?step=2`}
      />
    </form>
  );
}

function CustomQuestionField({
  question,
  initialValue,
  error,
}: {
  question: CustomQuestion;
  initialValue: string;
  error?: string;
}) {
  const t = useTranslations("admissions");
  const name = `question:${question.id}`;
  const errorText = error ? t(`customAnswerError_${error}`) : undefined;

  return (
    <Field
      label={question.label}
      htmlFor={name}
      required={question.required}
      hint={question.hint}
      error={errorText}
    >
      {question.type === "long_text" ? (
        <Textarea
          id={name}
          name={name}
          defaultValue={initialValue}
          rows={4}
          required={question.required}
          maxLength={2000}
        />
      ) : question.type === "yes_no" ? (
        <Select
          id={name}
          name={name}
          defaultValue={initialValue}
          required={question.required}
        >
          <option value="">—</option>
          <option value="yes">{t("yes")}</option>
          <option value="no">{t("no")}</option>
        </Select>
      ) : question.type === "select" ? (
        <Select
          id={name}
          name={name}
          defaultValue={initialValue}
          required={question.required}
        >
          <option value="">—</option>
          {(question.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      ) : question.type === "date" ? (
        <Input
          id={name}
          name={name}
          type="date"
          defaultValue={initialValue}
          required={question.required}
        />
      ) : question.type === "number" ? (
        <Input
          id={name}
          name={name}
          type="number"
          defaultValue={initialValue}
          required={question.required}
        />
      ) : (
        <Input
          id={name}
          name={name}
          type="text"
          defaultValue={initialValue}
          required={question.required}
          maxLength={200}
        />
      )}
    </Field>
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
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
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
