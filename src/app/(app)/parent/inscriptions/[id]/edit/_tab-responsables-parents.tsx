"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import { useConfirm } from "@/components/ui/confirm";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import {
  saveResponsableAnswers,
  deleteResponsable,
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
};

/**
 * Two-parent editor for the Responsables tab. Each guardian (Père / Mère /
 * Tuteur) is a card rendering the SAME parent dossier fields used on the
 * fiche — prefilled per guardian. Saves each parent's answers into its
 * ApplicationResponsable.customAnswers.
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
  const [rows, setRows] = useState<ResponsableParent[]>(
    initial.length
      ? initial
      : [{ id: "new-pere", kind: "PERE", answers: {} }, { id: "new-mere", kind: "MERE", answers: {} }],
  );

  function patchRow(idx: number, patch: Partial<ResponsableParent>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
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
              { id: `new-${Date.now()}`, kind: "TUTEUR", answers: {} },
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
  onChangeKind: (k: Kind) => void;
  onChangeAnswers: (a: FieldAnswers) => void;
  onPersistedId: (id: string) => void;
  onRemoved: () => void;
}) {
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();
  const confirm = useConfirm();
  const isNew = row.id.startsWith("new-");

  function onSave() {
    start(async () => {
      const r = await saveResponsableAnswers(
        applicationId,
        isNew ? null : row.id,
        { kind: row.kind, answers: row.answers },
      );
      if (r.ok) {
        toast.success("Responsable enregistré");
        if (isNew) onPersistedId(`saved-${Date.now()}`);
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
