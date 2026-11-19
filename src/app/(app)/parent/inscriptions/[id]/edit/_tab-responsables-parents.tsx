"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import { useConfirm } from "@/components/ui/confirm";
import { useField } from "@/components/dossier/tenant-config-context";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import {
  saveResponsableAnswers,
  deleteResponsable,
  setFinancialResponsable,
} from "../../_actions";

type Kind = "PERE" | "MERE" | "TUTEUR" | "AUTRE";
const KIND_LABEL: Record<Kind, string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur / Tutrice",
  AUTRE: "Autre responsable",
};

export type ResponsableParent = {
  id: string;
  kind: Kind;
  answers: FieldAnswers;
  /**
   * The family declared this responsable as the financially responsible
   * parent — the one who pays and who carries the family code. At most one
   * per dossier, and nobody until the family chooses: nothing is pre-ticked.
   */
  financial: boolean;
};

/** A card that exists only on screen so far: it has no saved row behind it. */
const isUnsaved = (id: string) => id.startsWith("new-");

/**
 * Two-parent editor for the Responsables tab. Each guardian (Père / Mère /
 * Tuteur) is a card rendering the SAME parent dossier fields used on the
 * fiche — prefilled per guardian. Saves each parent's answers into its
 * ApplicationResponsable.customAnswers.
 *
 * One of the cards can be marked "Responsable financier" (a single choice
 * across the cards, never pre-ticked: only what the family chose is stored).
 * For a saved card the choice is recorded at once; for a card not saved yet
 * it is recorded when that card is saved.
 */
export function DossierResponsablesParents({
  applicationId,
  parentConfig,
  initial,
  establishments,
  disabled,
}: {
  applicationId: string;
  parentConfig: EntityFieldsConfig;
  initial: ResponsableParent[];
  establishments: Array<{ id: string; name: string; levels?: string[] }>;
  disabled: boolean;
}) {
  const t = useTranslations("dossier");
  const tForms = useTranslations("dossierForms");
  const [rows, setRows] = useState<ResponsableParent[]>(
    initial.length
      ? initial
      : [
          { id: "new-pere", kind: "PERE", answers: {}, financial: false },
          { id: "new-mere", kind: "MERE", answers: {}, financial: false },
        ],
  );
  const [pickingFinancial, startPick] = useTransition();
  // A tenant override can rename or hide the control (same mechanism as
  // "Famille monoparentale").
  const financialField = useField("responsables.family.financiallyResponsible");
  const showFinancial = !financialField?.hidden;

  function patchRow(idx: number, patch: Partial<ResponsableParent>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function pickFinancial(idx: number) {
    const picked = rows[idx];
    if (!picked || picked.financial || disabled || pickingFinancial) return;
    // Who was marked before, to put back if the save fails. Only the mark is
    // restored: anything typed in the cards meanwhile is left alone.
    const previousId = rows.find((r) => r.financial)?.id ?? null;
    const pickedId = picked.id;
    setRows((prev) => prev.map((r) => ({ ...r, financial: r.id === pickedId })));
    // Not saved yet: the choice travels with the card when it is saved.
    if (isUnsaved(pickedId)) return;
    startPick(async () => {
      let ok = false;
      try {
        ok = (await setFinancialResponsable(applicationId, pickedId)).ok;
      } catch {
        ok = false;
      }
      if (ok) {
        toast.success(t("financialResponsibleSaved"));
      } else {
        setRows((prev) =>
          prev.map((r) => ({ ...r, financial: r.id === previousId })),
        );
        toast.error(tForms("saveError"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {rows.map((row, idx) => (
        <ParentCard
          key={row.id}
          applicationId={applicationId}
          parentConfig={parentConfig}
          establishments={establishments}
          row={row}
          disabled={disabled}
          financial={
            showFinancial
              ? {
                  label: financialField?.label ?? t("financialResponsible"),
                  hint: t("financialResponsibleHint"),
                  unsavedNote: t("financialResponsibleUnsaved"),
                  busy: pickingFinancial,
                  onPick: () => pickFinancial(idx),
                }
              : null
          }
          onChangeKind={(kind) => patchRow(idx, { kind })}
          onChangeAnswers={(answers) => patchRow(idx, { answers })}
          onPersistedId={(id) => patchRow(idx, { id })}
          onRemoved={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
        />
      ))}
      {!disabled ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { id: `new-${Date.now()}`, kind: "TUTEUR", answers: {}, financial: false },
            ])
          }
          className="gap-1.5"
        >
          <Plus className="size-4" aria-hidden />
          Ajouter un responsable
        </Button>
      ) : null}
    </div>
  );
}

function ParentCard({
  applicationId,
  parentConfig,
  establishments,
  row,
  disabled,
  financial,
  onChangeKind,
  onChangeAnswers,
  onPersistedId,
  onRemoved,
}: {
  applicationId: string;
  parentConfig: EntityFieldsConfig;
  establishments: Array<{ id: string; name: string; levels?: string[] }>;
  row: ResponsableParent;
  disabled: boolean;
  /** The "responsable financier" choice; null when the tenant hides it. */
  financial: {
    label: string;
    hint: string;
    unsavedNote: string;
    busy: boolean;
    onPick: () => void;
  } | null;
  onChangeKind: (k: Kind) => void;
  onChangeAnswers: (a: FieldAnswers) => void;
  onPersistedId: (id: string) => void;
  onRemoved: () => void;
}) {
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();
  const confirm = useConfirm();
  const isNew = isUnsaved(row.id);

  function onSave() {
    start(async () => {
      const r = await saveResponsableAnswers(
        applicationId,
        isNew ? null : row.id,
        {
          kind: row.kind,
          answers: row.answers,
          // Sent only for the card the family ticked: saving any other card
          // never touches the mark.
          ...(financial && row.financial ? { financial: true } : {}),
        },
      );
      if (r.ok) {
        toast.success("Responsable enregistré");
        // The real row id: the next save or delete of this card targets it.
        if (isNew && r.id) onPersistedId(r.id);
      } else {
        toast.error("Échec de l'enregistrement");
      }
    });
  }
  async function onDelete() {
    if (isNew) {
      onRemoved();
      return;
    }
    if (!(await confirm({ title: "Supprimer ce responsable ?", destructive: true })))
      return;
    startRemove(async () => {
      const r = await deleteResponsable(applicationId, row.id);
      if (r.ok) {
        toast.success("Responsable supprimé");
        onRemoved();
      } else {
        toast.error("Échec de la suppression");
      }
    });
  }

  const title =
    [row.answers.prenom, row.answers.nom].filter(Boolean).join(" ") ||
    KIND_LABEL[row.kind];

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <UserRound className="size-4 text-[color:var(--color-brand-600)]" aria-hidden />
            {title}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <Field label="Lien" htmlFor={`kind-${row.id}`}>
              <Select
                id={`kind-${row.id}`}
                value={row.kind}
                onChange={(e) => onChangeKind(e.target.value as Kind)}
                disabled={disabled}
                style={{ width: "10rem" }}
              >
                <option value="PERE">Père</option>
                <option value="MERE">Mère</option>
                <option value="TUTEUR">Tuteur / Tutrice</option>
                <option value="AUTRE">Autre</option>
              </Select>
            </Field>
            {!disabled ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={removing}
                aria-label="Supprimer ce responsable"
                className="mt-5 inline-flex size-9 items-center justify-center rounded-md text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger)]/10 disabled:opacity-40"
              >
                {removing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              </button>
            ) : null}
          </div>
        }
      />
      <CardBody>
        {financial ? (
          <label
            className={
              "mb-5 flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors duration-150 ease-out " +
              (row.financial
                ? "border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)]"
                : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]")
            }
          >
            <input
              type="radio"
              name={`financial-${applicationId}`}
              checked={row.financial}
              onChange={financial.onPick}
              // Locked while this card's own save is in flight: a tick made
              // then would not be part of what was sent.
              disabled={disabled || pending}
              aria-busy={financial.busy}
              aria-label={`${financial.label} : ${title}`}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="font-medium text-[color:var(--color-foreground)]">
                {financial.label}
              </span>
              <span className="block text-xs text-[color:var(--color-foreground-muted)]">
                {financial.hint}
              </span>
              {row.financial && isNew && !disabled ? (
                <span className="mt-0.5 block text-xs text-[color:var(--color-warning-soft-fg)]">
                  {financial.unsavedNote}
                </span>
              ) : null}
            </span>
          </label>
        ) : null}
        {/* No `user` in extras — userBoundTo fields (prénom/nom/email) must
            come from THIS responsable's answers, not the logged-in submitter. */}
        <FieldsRenderer
          config={parentConfig}
          answers={row.answers}
          extras={{ establishments }}
          disabled={disabled}
          unlockBound
          onChange={(id, value) => onChangeAnswers({ ...row.answers, [id]: value })}
        />
        {!disabled ? (
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={onSave} disabled={pending} className="gap-2" variant="secondary">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {pending ? "Enregistrement…" : "Enregistrer ce responsable"}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
