"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditTab } from "@/components/fiche/edit-tabs";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { RESPONSABLE_RELATIONS } from "@/app/(app)/parent/inscriptions/[id]/edit/_section-responsable-lebanese";
import type { ParentFormState } from "../_actions";

const LOCALES = ["fr", "en", "ar"] as const;

export function EditParentForm({
  action,
  initial,
  labels,
}: {
  action: (state: ParentFormState, formData: FormData) => Promise<ParentFormState>;
  initial: {
    firstName: string;
    lastName: string;
    email: string;
    relation: string;
    locale: string;
  };
  /**
   * Override the default i18n labels for built-in fields. Pass the
   * tenant-configured labels (resolved from parentFieldsConfig's
   * userBoundTo fields) so the edit form matches the rest of the app.
   * When undefined, falls back to the parents i18n namespace.
   */
  labels?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tDossier = useTranslations("dossierForms");
  const { markDirty, markClean } = useEditTab();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ParentFormState>({});
  const [pending, startTransition] = useTransition();

  // The fields are locked while a save is in flight, which takes the keyboard
  // focus away from the one being edited: hand it back afterwards.
  const focusedAtSubmit = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (pending) return;
    const el = focusedAtSubmit.current;
    focusedAtSubmit.current = null;
    if (el && el.isConnected && document.activeElement === document.body) {
      el.focus();
    }
  }, [pending]);

  const storedLocale = (LOCALES as readonly string[]).includes(initial.locale)
    ? initial.locale
    : "fr";
  // A stored relation outside the list still gets its own option, so the
  // dropdown shows what is stored instead of "—".
  const relationListed =
    !initial.relation ||
    (RESPONSABLE_RELATIONS as readonly string[]).includes(initial.relation);

  // The inputs are uncontrolled: compare what the form holds with what is
  // stored to know whether the tab has something to save.
  function syncDirty() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const held = (name: string) => String(fd.get(name) ?? "").trim();
    const same =
      held("firstName") === initial.firstName.trim() &&
      held("lastName") === initial.lastName.trim() &&
      held("email").toLowerCase() === initial.email.trim().toLowerCase() &&
      held("relation") === initial.relation &&
      held("locale") === storedLocale;
    if (same) markClean();
    else markDirty();
  }

  // Submitted by hand rather than through `<form action>`: React resets a
  // form after an action, and a reset puts each dropdown back on the option
  // it had when the page loaded — the next save would then write that old
  // value back.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const active = document.activeElement;
    focusedAtSubmit.current =
      active instanceof HTMLElement && e.currentTarget.contains(active)
        ? active
        : null;
    startTransition(async () => {
      let next: ParentFormState;
      try {
        next = await action({}, fd);
      } catch {
        next = { formError: "failed" };
      }
      setResult(next);
      if (!next.errors && !next.formError) {
        markClean();
        toast.success(t("accountSaved"));
      }
    });
  }

  const emailError =
    result.errors?.email === "exists"
      ? t("emailExists")
      : result.errors?.email === "staffDomain"
        ? t("emailStaffDomainError")
        : result.errors?.email;
  const formError = result.formError
    ? result.formError === "not-found"
      ? t("staffLockedNotice")
      : t("editSaveError")
    : null;

  // The two dropdowns are keyed on their stored value, so each comes back on
  // exactly what was saved. The text inputs are left alone: they keep the
  // keyboard focus and what was typed (the stored value only differs by
  // trimming and letter case, which the unsaved check ignores).
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onChange={syncDirty}
      className="space-y-5"
    >
      {/* Locked while saving: a change made during the round trip would not
          be part of what was sent, yet the tab would be marked as saved. */}
      <fieldset disabled={pending} className="min-w-0 space-y-5">
      <FormRow>
        <Field
          label={labels?.firstName ?? t("fieldFirstName")}
          htmlFor="firstName"
          required
          error={result.errors?.firstName}
        >
          <Input
            id="firstName"
            name="firstName"
            defaultValue={initial.firstName}
            required
          />
        </Field>
        <Field
          label={labels?.lastName ?? t("fieldLastName")}
          htmlFor="lastName"
          required
          error={result.errors?.lastName}
        >
          <Input
            id="lastName"
            name="lastName"
            defaultValue={initial.lastName}
            required
          />
        </Field>
      </FormRow>

      <Field
        label={labels?.email ?? t("fieldEmail")}
        htmlFor="email"
        required
        error={emailError}
      >
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={initial.email}
          required
        />
      </Field>

      <FormRow>
        <Field label={t("fieldRelation")} htmlFor="relation">
          <Select
            key={initial.relation}
            id="relation"
            name="relation"
            defaultValue={initial.relation}
          >
            {/* No blank choice once a relation is stored: the save does not
                clear it ("Non défini" is the explicit choice for that). */}
            {initial.relation ? null : <option value="">—</option>}
            {relationListed ? null : (
              <option value={initial.relation}>{initial.relation}</option>
            )}
            {RESPONSABLE_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {tDossier(`responsable.relations.${r}` as never)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldLocale")} htmlFor="locale">
          <Select
            key={storedLocale}
            id="locale"
            name="locale"
            defaultValue={storedLocale}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </Field>
      </FormRow>
      </fieldset>

      {formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
