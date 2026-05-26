"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveMonoParental } from "../../_actions";

/**
 * Footer row of the Responsables tab — sits at the very bottom and
 * carries two distinct controls:
 *
 *   - "Ajouter un responsable" button. Stubbed for now; shows a toast
 *     when clicked so parents know the feature is coming.
 *   - "Famille monoparentale" checkbox. Functional today — toggles
 *     Application.monoParental so admin knows there's no second
 *     parent to chase for missing info.
 *
 * Phase 4: monoParental honors useField (label / required / hidden)
 * and is wrapped in EditableField for the WYSIWYG pencil. editMode
 * no-ops the toggle so the preview doesn't write to the (mock) row.
 */
export function ResponsableFooter({
  applicationId,
  initialMonoParental,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initialMonoParental: boolean;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tDossier = useTranslations("dossier");
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(initialMonoParental);

  const fMono = useField("responsables.family.monoParental");

  function onAddResponsable() {
    toast.info(t("responsable.addComingSoon"));
  }

  function onToggleMonoParental() {
    if (editMode) {
      // Preview-only flip; don't hit the DB.
      setChecked((v) => !v);
      return;
    }
    const next = !checked;
    setChecked(next);
    startTransition(async () => {
      const r = await saveMonoParental(applicationId, next);
      if (!r.ok) {
        // Revert optimistic toggle on failure.
        setChecked(!next);
        toast.error(t("saveError"));
      }
    });
  }

  // Hide the monoParental control entirely when the override sets
  // hidden=true. The "Ajouter un responsable" stub stays put — it's a
  // structural button, not a configurable field.
  const showMono = !fMono?.hidden;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3">
      <button
        type="button"
        onClick={onAddResponsable}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-700)] disabled:opacity-50"
      >
        <Plus className="size-3.5" aria-hidden />
        {tDossier("addResponsable")}
      </button>

      {showMono ? (
        <EditableField fieldKey="responsables.family.monoParental">
          <label className="inline-flex items-center gap-2 px-2 py-1 text-sm text-[color:var(--color-foreground)]">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggleMonoParental}
              disabled={disabled || pending}
              className="size-4 rounded border-[color:var(--color-border-strong)]"
            />
            {fMono?.label ?? tDossier("monoParental")}
            {fMono?.required ? (
              <span className="ms-0.5 text-[color:var(--color-danger)]">*</span>
            ) : null}
            {pending ? (
              <Loader2 className="ms-1 size-3 animate-spin text-[color:var(--color-foreground-subtle)]" aria-hidden />
            ) : null}
          </label>
        </EditableField>
      ) : null}
    </div>
  );
}
