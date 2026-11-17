"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { NATIONALITIES_FR } from "@/lib/lookups";
import { useEditTab } from "@/components/fiche/edit-tabs";
import type { ParentIdentityFormState } from "../_actions";

type IdentityValues = {
  isLebanese: boolean | null;
  passportLebanese: string;
  nationality1: string;
  nationality2: string;
  monoParental: boolean;
};

/** The passport only counts (and is only stored) for a Lebanese responsable. */
const passportOf = (v: IdentityValues) =>
  v.isLebanese === true ? v.passportLebanese.trim() : "";

const sameIdentity = (a: IdentityValues, b: IdentityValues) =>
  a.isLebanese === b.isLebanese &&
  passportOf(a) === passportOf(b) &&
  a.nationality1 === b.nationality1 &&
  a.nationality2 === b.nationality2 &&
  a.monoParental === b.monoParental;

/**
 * A nationality dropdown that also offers the stored value when the built-in
 * list does not have it (imported spellings such as "Armenienne"), so the
 * field shows what is stored instead of "—".
 */
function NationalitySelect({
  id,
  value,
  stored,
  onChange,
}: {
  id: string;
  value: string;
  /** The saved value: stays on offer after another one is picked. */
  stored: string;
  onChange: (value: string) => void;
}) {
  const unlisted =
    stored && !(NATIONALITIES_FR as readonly string[]).includes(stored)
      ? stored
      : null;
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {unlisted ? <option value={unlisted}>{unlisted}</option> : null}
      {NATIONALITIES_FR.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </Select>
  );
}

/**
 * Admin-side edit for the parent's "Identité du responsable" data
 * (Lebanese, passport, nationality 1/2, mono-parental). Mirrors the
 * exact same fields + behavior as the dossier's hardcoded Responsable
 * identity card (`_section-responsable-lebanese.tsx`) so parents and
 * admins see consistent input shapes.
 *
 * Canonical storage is on Guardian (parent-level identity facts).
 * Writes also propagate to every existing Application's submitter*
 * columns so historic dossiers stay consistent. Works even before
 * the parent has created any application.
 */
export function ParentIdentityForm({
  action,
  initial,
}: {
  action: (
    state: ParentIdentityFormState,
    formData: FormData,
  ) => Promise<ParentIdentityFormState>;
  initial: IdentityValues;
  hasApplications?: boolean;
}) {
  const t = useTranslations("parents");
  const { markDirty, markClean } = useEditTab();
  // `saved` is what the server holds; `values` is what the form shows.
  const [saved, setSaved] = useState<IdentityValues>(initial);
  const [values, setValues] = useState<IdentityValues>(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<IdentityValues>) =>
    setValues((prev) => ({ ...prev, ...patch }));

  const dirty = !sameIdentity(values, saved);
  useEffect(() => {
    if (dirty) markDirty();
    else markClean();
  }, [dirty, markDirty, markClean]);

  // Submitted by hand rather than through `<form action>`: React resets a
  // form after an action, which put these radios, dropdowns and the checkbox
  // back on their page-load state while the saved values were different.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const sent: IdentityValues = { ...values, passportLebanese: passportOf(values) };
    const fd = new FormData();
    fd.set(
      "isLebanese",
      sent.isLebanese === true ? "yes" : sent.isLebanese === false ? "no" : "",
    );
    fd.set("passportLebanese", sent.passportLebanese);
    fd.set("nationality1", sent.nationality1);
    fd.set("nationality2", sent.nationality2);
    fd.set("monoParental", sent.monoParental ? "yes" : "no");
    startTransition(async () => {
      let result: ParentIdentityFormState;
      try {
        result = await action({}, fd);
      } catch {
        result = { formError: "failed" };
      }
      if (result.ok) {
        setSaved(sent);
        setFormError(null);
        toast.success("Identité enregistrée");
      } else {
        setFormError(result.formError ?? "failed");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Locked while saving: a change made during the round trip would not
          be part of what was sent, yet the tab would be marked as saved. */}
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <FormRow>
          <Field label="Nationalité libanaise" htmlFor="isLebanese" required>
            <div className="flex h-9 items-center gap-4">
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="isLebanese"
                  checked={values.isLebanese === true}
                  onChange={() => set({ isLebanese: true })}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="isLebanese"
                  checked={values.isLebanese === false}
                  onChange={() => set({ isLebanese: false, passportLebanese: "" })}
                />
                Non
              </label>
            </div>
          </Field>
          {values.isLebanese === true ? (
            <Field
              label="N° passeport ou carte d'identité libanaise"
              htmlFor="passportLebanese"
              required
            >
              <Input
                id="passportLebanese"
                value={values.passportLebanese}
                onChange={(e) => set({ passportLebanese: e.target.value })}
                maxLength={40}
              />
            </Field>
          ) : (
            <div />
          )}
        </FormRow>

        <FormRow>
          <Field label="Nationalité 1" htmlFor="nationality1">
            <NationalitySelect
              id="nationality1"
              value={values.nationality1}
              stored={saved.nationality1}
              onChange={(v) => set({ nationality1: v })}
            />
          </Field>
          <Field label="Nationalité 2" htmlFor="nationality2">
            <NationalitySelect
              id="nationality2"
              value={values.nationality2}
              stored={saved.nationality2}
              onChange={(v) => set({ nationality2: v })}
            />
          </Field>
        </FormRow>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.monoParental}
            onChange={(e) => set({ monoParental: e.target.checked })}
            className="size-4 rounded border-[color:var(--color-border-strong)]"
          />
          Famille monoparentale
        </label>
      </fieldset>

      {formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {formError === "validation"
            ? "Une valeur est invalide."
            : formError === "not-found"
              ? t("staffLockedNotice")
              : t("editSaveError")}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
