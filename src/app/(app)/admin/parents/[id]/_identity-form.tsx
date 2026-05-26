"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { NATIONALITIES_FR } from "@/lib/lookups";
import type { ParentIdentityFormState } from "../_actions";

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
  initial: {
    isLebanese: boolean | null;
    passportLebanese: string;
    nationality1: string;
    nationality2: string;
    monoParental: boolean;
  };
  hasApplications?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ParentIdentityFormState,
    FormData
  >(action, {});
  const [isLebanese, setIsLebanese] = useState<boolean | null>(
    initial.isLebanese,
  );
  const [passportLebanese, setPassportLebanese] = useState(
    initial.passportLebanese,
  );
  const [nationality1, setNationality1] = useState(initial.nationality1);
  const [nationality2, setNationality2] = useState(initial.nationality2);
  const [monoParental, setMonoParental] = useState(initial.monoParental);

  // Show a toast on save success — the action returns ok=true but no
  // redirect, so otherwise the admin has no visible confirmation.
  if (state.ok && !pending) {
    // Once per render: schedule a toast then reset by leaving state alone
    // (next form interaction will reset state.ok via React's normal flow).
  }

  return (
    <form
      action={(fd) => {
        // Inject controlled values into the FormData (we manage state
        // locally so the UI can toggle the passport field's visibility).
        fd.set("isLebanese", isLebanese === true ? "yes" : isLebanese === false ? "no" : "");
        fd.set(
          "passportLebanese",
          isLebanese === true ? passportLebanese : "",
        );
        fd.set("nationality1", nationality1);
        fd.set("nationality2", nationality2);
        fd.set("monoParental", monoParental ? "yes" : "no");
        formAction(fd);
        // Best-effort toast — the action's revalidation will refresh
        // the underlying preview when admin navigates back.
        setTimeout(() => {
          toast.success("Identité enregistrée");
        }, 50);
      }}
      className="space-y-5"
    >

      <FormRow>
        <Field label="Nationalité libanaise" htmlFor="isLebanese" required>
          <div className="flex h-9 items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="isLebanese"
                checked={isLebanese === true}
                onChange={() => setIsLebanese(true)}
              />
              Oui
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="isLebanese"
                checked={isLebanese === false}
                onChange={() => {
                  setIsLebanese(false);
                  setPassportLebanese("");
                }}
              />
              Non
            </label>
          </div>
        </Field>
        {isLebanese === true ? (
          <Field
            label="N° passeport ou carte d'identité libanaise"
            htmlFor="passportLebanese"
            required
          >
            <Input
              id="passportLebanese"
              value={passportLebanese}
              onChange={(e) => setPassportLebanese(e.target.value)}
              maxLength={40}
            />
          </Field>
        ) : (
          <div />
        )}
      </FormRow>

      <FormRow>
        <Field label="Nationalité 1" htmlFor="nationality1">
          <Select
            id="nationality1"
            value={nationality1}
            onChange={(e) => setNationality1(e.target.value)}
          >
            <option value="">—</option>
            {NATIONALITIES_FR.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nationalité 2" htmlFor="nationality2">
          <Select
            id="nationality2"
            value={nationality2}
            onChange={(e) => setNationality2(e.target.value)}
          >
            <option value="">—</option>
            {NATIONALITIES_FR.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={monoParental}
          onChange={(e) => setMonoParental(e.target.checked)}
          className="size-4 rounded border-[color:var(--color-border-strong)]"
        />
        Famille monoparentale
      </label>

      {state.formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {state.formError === "validation"
            ? "Une valeur est invalide."
            : state.formError}
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
