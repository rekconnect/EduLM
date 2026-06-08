"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input, Select, Textarea } from "@/components/ui/input";

export type StudentIdentity = {
  firstName: string;
  lastName: string;
  dob: string;
  status: string;
  gender: string;
  nationality: string;
  placeOfBirth: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  previousSchool: string;
  emergencyContact: string;
  internalNotes: string;
};

const GENDER: Record<string, string> = {
  MALE: "Garçon",
  FEMALE: "Fille",
  OTHER: "Autre",
};
const STATUS: Record<string, string> = {
  PROSPECT: "Prospect",
  ENROLLED: "Inscrit",
  WITHDRAWN: "Parti",
  GRADUATED: "Diplômé",
};

function EditRow({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={"block space-y-1" + (full ? " sm:col-span-2" : "")}>
      <span className="text-xs text-[color:var(--color-foreground-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Built-in student identity columns shown as a read-only block with a pencil
 * to edit in place — the same UX as the parent fiche's EditableGroup, so the
 * student fiche is consistent (no always-open form).
 */
export function StudentIdentitySection({
  initial,
  onSave,
}: {
  initial: StudentIdentity;
  onSave: (v: StudentIdentity) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<StudentIdentity>(initial);
  const [pending, start] = useTransition();
  const set = (k: keyof StudentIdentity, val: string) =>
    setV((p) => ({ ...p, [k]: val }));

  function save() {
    start(async () => {
      const r = await onSave(v);
      if (r.ok) {
        toast.success("Enregistré");
        setEditing(false);
      } else {
        toast.error(r.error ? `Échec : ${r.error}` : "Échec de l'enregistrement");
      }
    });
  }
  function cancel() {
    setV(initial);
    setEditing(false);
  }

  const rows: Array<[string, string]> = [
    ["Prénom", v.firstName],
    ["Nom", v.lastName],
    ["Date de naissance", v.dob],
    ["Genre", v.gender ? (GENDER[v.gender] ?? v.gender) : ""],
    ["Statut", STATUS[v.status] ?? v.status],
    ["Nationalité", v.nationality],
    ["Lieu de naissance", v.placeOfBirth],
    ["Adresse", v.address],
    ["Ville", v.city],
    ["Code postal", v.postalCode],
    ["Pays", v.country],
    ["École précédente", v.previousSchool],
    ["Contact d'urgence", v.emergencyContact],
    ["Notes internes", v.internalNotes],
  ];
  const readRows = rows.filter(([, val]) => val && val.trim().length > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          Identité
        </h4>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              aria-label="Annuler"
              className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
            >
              <X className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-6 items-center gap-1 rounded bg-[color:var(--color-brand-600)] px-2 text-xs font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3" aria-hidden />
              )}
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Modifier Identité"
            className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
          >
            <Pencil className="size-3" aria-hidden />
          </button>
        )}
      </div>

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <EditRow label="Prénom">
            <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </EditRow>
          <EditRow label="Nom">
            <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </EditRow>
          <EditRow label="Date de naissance">
            <Input type="date" value={v.dob} onChange={(e) => set("dob", e.target.value)} />
          </EditRow>
          <EditRow label="Genre">
            <Select value={v.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">—</option>
              <option value="MALE">Garçon</option>
              <option value="FEMALE">Fille</option>
              <option value="OTHER">Autre</option>
            </Select>
          </EditRow>
          <EditRow label="Statut">
            <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
              <option value="PROSPECT">Prospect</option>
              <option value="ENROLLED">Inscrit</option>
              <option value="WITHDRAWN">Parti</option>
              <option value="GRADUATED">Diplômé</option>
            </Select>
          </EditRow>
          <EditRow label="Nationalité">
            <Input value={v.nationality} onChange={(e) => set("nationality", e.target.value)} />
          </EditRow>
          <EditRow label="Lieu de naissance">
            <Input value={v.placeOfBirth} onChange={(e) => set("placeOfBirth", e.target.value)} />
          </EditRow>
          <EditRow label="Adresse">
            <Input value={v.address} onChange={(e) => set("address", e.target.value)} />
          </EditRow>
          <EditRow label="Ville">
            <Input value={v.city} onChange={(e) => set("city", e.target.value)} />
          </EditRow>
          <EditRow label="Code postal">
            <Input value={v.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          </EditRow>
          <EditRow label="Pays">
            <Input value={v.country} onChange={(e) => set("country", e.target.value)} />
          </EditRow>
          <EditRow label="École précédente">
            <Input value={v.previousSchool} onChange={(e) => set("previousSchool", e.target.value)} />
          </EditRow>
          <EditRow label="Contact d'urgence">
            <Input value={v.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} />
          </EditRow>
          <EditRow label="Notes internes" full>
            <Textarea
              rows={2}
              value={v.internalNotes}
              onChange={(e) => set("internalNotes", e.target.value)}
            />
          </EditRow>
        </div>
      ) : readRows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-subtle)]">—</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {readRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-[color:var(--color-foreground-muted)]">
                {label}
              </dt>
              <dd className="truncate text-sm font-medium text-[color:var(--color-foreground)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
