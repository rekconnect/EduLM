"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldsRenderer, type FieldExtras } from "@/components/fields-renderer";
import { useEditTab } from "@/components/fiche/edit-tabs";
import type {
  EntityFieldsConfig,
  FieldCategory,
  FieldDef,
} from "@/lib/entity-fields";
import { saveGuardianFiche } from "./_fiche-actions";

/**
 * One category of the tenant's parent fields, as its own form with its own
 * Save — the content of one tab of the parent edit page.
 *
 * Saving goes through `saveGuardianFiche`, the same action as the in-place
 * pencils on the fiche: every value is routed to its home (Guardian column,
 * Family column, or the stored answers) and MERGED into what is stored.
 * Only the fields that actually changed are sent, so a save can never touch —
 * let alone erase — anything the admin did not edit. A changed household
 * answer is also copied to the family's other guardians by that action.
 */
export function ParentCategoryForm({
  targetUserId,
  category,
  fields,
  initialValues,
  contextAnswers,
  establishments,
  rtl = false,
  note,
}: {
  /** Account the values belong to (the family's address holder for a shared category). */
  targetUserId: string;
  category: FieldCategory;
  /** Fields shown in this tab, already filtered and ordered by the page. */
  fields: FieldDef[];
  /** Current value of each of `fields`, keyed by field id. */
  initialValues: Record<string, string>;
  /**
   * The record's other answers, keyed by field id. Read-only context: lets a
   * field of this tab depend on one that lives in another category.
   */
  contextAnswers: Record<string, string>;
  establishments: NonNullable<FieldExtras["establishments"]>;
  rtl?: boolean;
  /** Optional explanation shown above the fields. */
  note?: string;
}) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const { markDirty, markClean } = useEditTab();
  const [baseline, setBaseline] = useState(initialValues);
  const [values, setValues] = useState(initialValues);
  const [pending, startTransition] = useTransition();

  // A field can join the tab after it mounted (the page re-rendered with
  // another set of fields — "Actuel(le)" follows the relation): it has no
  // entry in state yet and takes its stored value from the fresh props.
  const current = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fields) out[f.id] = values[f.id] ?? initialValues[f.id] ?? "";
    return out;
  }, [fields, values, initialValues]);
  const changed = useMemo(
    () =>
      fields.filter(
        (f) =>
          (current[f.id] ?? "") !==
          (baseline[f.id] ?? initialValues[f.id] ?? ""),
      ),
    [fields, current, baseline, initialValues],
  );
  const dirty = changed.length > 0;

  useEffect(() => {
    if (dirty) markDirty();
    else markClean();
  }, [dirty, markDirty, markClean]);
  // A form that goes away takes its unsaved flag with it.
  useEffect(() => () => markClean(), [markClean]);

  const config = useMemo<EntityFieldsConfig>(
    () => ({ categories: [{ ...category, active: true }], fields }),
    [category, fields],
  );
  const answers = useMemo(
    () => ({ ...contextAnswers, ...current }),
    [contextAnswers, current],
  );
  const extras = useMemo<FieldExtras>(
    () => ({ establishments }),
    [establishments],
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || pending) return;
    const sent = changed;
    const snapshot = current;
    // Named by field id, so each value reaches exactly the field it was
    // typed in — even if two fields of the config share a storage key.
    const payload: Record<string, string> = {};
    for (const f of sent) payload[f.id] = snapshot[f.id] ?? "";
    startTransition(async () => {
      let result: { ok: boolean; error?: string };
      try {
        result = await saveGuardianFiche(targetUserId, payload, {
          keyedBy: "id",
        });
      } catch {
        result = { ok: false };
      }
      if (result.ok) {
        setBaseline((prev) => {
          const next = { ...prev };
          for (const f of sent) next[f.id] = snapshot[f.id] ?? "";
          return next;
        });
        toast.success(tCommon("saved"));
      } else {
        toast.error(
          result.error === "no-family"
            ? t("editNoFamilyError")
            : t("editSaveError"),
        );
      }
    });
  }

  return (
    // noValidate: an admin correcting one value must not be blocked because
    // another required field of the category was never filled in.
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {note ? (
        <p className="flex items-start gap-2 rounded-md bg-[color:var(--color-surface-sunken)] px-3 py-2 text-sm text-[color:var(--color-foreground-muted)]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{note}</span>
        </p>
      ) : null}

      <div dir={rtl ? "rtl" : undefined}>
        <FieldsRenderer
          config={config}
          answers={answers}
          extras={extras}
          disabled={pending}
          unlockBound
          hideCategoryHeadings
          columns={2}
          keepUnlistedValues
          onChange={(id, value) =>
            setValues((prev) => ({ ...prev, [id]: value }))
          }
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setValues(baseline)}
          >
            {t("editDiscard")}
          </Button>
        ) : null}
        <Button type="submit" disabled={!dirty || pending} className="gap-2">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
