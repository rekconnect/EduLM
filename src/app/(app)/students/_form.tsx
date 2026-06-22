"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { NATIONALITIES_FR } from "@/lib/lookups";
import type { FieldDef } from "@/lib/entity-fields";
import {
  STUDENT_ALL_CREATE_KEYS,
  type StudentAllCreateKey,
  type StudentCreateConfig,
  isStudentRequiredKey,
  studentCreateDefaultLabel,
} from "@/lib/student-create-config";
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
  config,
}: {
  action: (state: StudentFormState, formData: FormData) => Promise<StudentFormState>;
  initial?: StudentValues;
  submitLabel: string;
  /** Admin "Add a student" config — controls which standard fields show, their
   *  required state, their label override and order, plus any custom fields.
   *  Omitted (edit form) ⇒ everything visible, default labels, default order. */
  config?: StudentCreateConfig;
}) {
  const t = useTranslations("students");
  const tAdm = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [state, formAction, pending] = useActionState<StudentFormState, FormData>(
    action,
    {},
  );

  const mode = (k: StudentAllCreateKey): "required" | "optional" | "hidden" => {
    if (isStudentRequiredKey(k)) return "required";
    return config?.builtin[k] ?? "optional";
  };
  const show = (k: StudentAllCreateKey) => mode(k) !== "hidden";
  const req = (k: StudentAllCreateKey) => mode(k) === "required";

  // All standard fields (required + configurable) in the admin order; hidden
  // ones dropped. Required fields can't be hidden, so they always survive.
  const orderedFields = [...STUDENT_ALL_CREATE_KEYS]
    .filter(show)
    .sort(
      (a, b) =>
        (config?.builtinMeta?.[a]?.order ?? STUDENT_ALL_CREATE_KEYS.indexOf(a)) -
        (config?.builtinMeta?.[b]?.order ?? STUDENT_ALL_CREATE_KEYS.indexOf(b)),
    );

  const labelFor = (k: StudentAllCreateKey) =>
    config?.builtinMeta?.[k]?.label ||
    studentCreateDefaultLabel(
      k,
      (s) => t(s as never),
      (s) => tAdm(s as never),
    );

  const initVal = (k: StudentAllCreateKey): string => {
    const v = (initial as Record<string, unknown> | undefined)?.[k];
    return typeof v === "string" ? v : "";
  };

  // nationality2 isn't a typed StudentInput key (it's stored in customAnswers),
  // so read errors through a loose lookup.
  const errorFor = (key: string) =>
    (state.errors as Record<string, string> | undefined)?.[key];

  function renderField(k: StudentAllCreateKey) {
    const label = labelFor(k);
    if (k === "status") {
      return (
        <Field key={k} label={label} htmlFor="status" required error={state.errors?.status}>
          <Select id="status" name="status" defaultValue={initial?.status ?? "PROSPECT"}>
            <option value="PROSPECT">{t("statusProspect")}</option>
            <option value="ENROLLED">{t("statusEnrolled")}</option>
            <option value="WITHDRAWN">{t("statusWithdrawn")}</option>
            <option value="GRADUATED">{t("statusGraduated")}</option>
          </Select>
        </Field>
      );
    }
    if (k === "gender") {
      return (
        <Field key={k} label={label} htmlFor="gender" required={req(k)} error={state.errors?.gender}>
          <Select id="gender" name="gender" defaultValue={initial?.gender ?? ""} required={req(k)}>
            <option value="">—</option>
            <option value="MALE">{tAdm("genderMale")}</option>
            <option value="FEMALE">{tAdm("genderFemale")}</option>
            <option value="OTHER">{tAdm("genderOther")}</option>
          </Select>
        </Field>
      );
    }
    if (k === "dob") {
      return (
        <Field key={k} label={label} htmlFor="dob" required={req(k)} error={state.errors?.dob}>
          <DatePicker
            id="dob"
            name="dob"
            defaultValue={initVal(k)}
            required={req(k)}
            placeholder={tCommon("selectDate")}
          />
        </Field>
      );
    }
    if (k === "nationality" || k === "nationality2") {
      return (
        <Field key={k} label={label} htmlFor={k} required={req(k)} error={errorFor(k)}>
          <Select id={k} name={k} defaultValue={initVal(k)} required={req(k)}>
            <option value="">—</option>
            {NATIONALITIES_FR.map((nat) => (
              <option key={nat} value={nat}>
                {nat}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    if (k === "internalNotes") {
      return (
        <Field key={k} label={label} htmlFor="internalNotes" hint={t("fieldInternalNotesHint")} required={req(k)} error={state.errors?.internalNotes}>
          <Textarea id="internalNotes" name="internalNotes" rows={4} defaultValue={initVal(k)} required={req(k)} />
        </Field>
      );
    }
    // Text fields: firstName, lastName, nationality, placeOfBirth, address,
    // city, postalCode, country, previousSchool, emergencyContact.
    return (
      <Field
        key={k}
        label={label}
        htmlFor={k}
        required={req(k)}
        hint={k === "emergencyContact" ? t("fieldEmergencyContactHint") : undefined}
        error={errorFor(k)}
      >
        <Input
          id={k}
          name={k}
          defaultValue={initVal(k)}
          required={req(k)}
          autoFocus={k === "firstName"}
        />
      </Field>
    );
  }

  const customFields = [...(config?.fields ?? [])]
    .filter((f) => f.active !== false)
    .sort((a, b) => a.order - b.order);

  return (
    <form action={formAction} className="space-y-8">
      {/* All standard fields (required + configurable) in admin order ── */}
      <section>
        <div className="space-y-4">{orderedFields.map(renderField)}</div>
      </section>

      {/* Custom fields (admin-configured) ─────────── */}
      {customFields.length > 0 ? (
        <section className="space-y-4">
          {customFields.map((f) => (
            <CustomFieldInput key={f.id} field={f} />
          ))}
        </section>
      ) : null}

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

/** Renders one admin-configured custom field as an uncontrolled input named by
 *  its key, so createStudent can read it from FormData and store it in
 *  Student.customAnswers. */
function CustomFieldInput({ field }: { field: FieldDef }) {
  const id = `cf-${field.id}`;
  let input: React.ReactNode;
  if (field.type === "long_text") {
    input = <Textarea id={id} name={field.key} rows={3} required={field.required} />;
  } else if (field.type === "yes_no") {
    input = (
      <Select id={id} name={field.key} defaultValue="" required={field.required}>
        <option value="">—</option>
        <option value="yes">Oui</option>
        <option value="no">Non</option>
      </Select>
    );
  } else if (field.type === "select") {
    input = (
      <Select id={id} name={field.key} defaultValue="" required={field.required}>
        <option value="">—</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  } else {
    const htmlType =
      field.type === "date"
        ? "date"
        : field.type === "number"
          ? "number"
          : field.type === "email"
            ? "email"
            : field.type === "phone"
              ? "tel"
              : "text";
    input = <Input id={id} name={field.key} type={htmlType} required={field.required} />;
  }
  return (
    <Field label={field.label} htmlFor={id} required={field.required}>
      {input}
    </Field>
  );
}
