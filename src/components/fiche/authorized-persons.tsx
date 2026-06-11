"use client";

import { useState, useTransition } from "react";
import {
  Pencil,
  Check,
  X,
  Loader2,
  Plus,
  Trash2,
  Phone,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export type AuthorizedPerson = {
  relation: string;
  name: string;
  phone: string;
  emergency: boolean;
};

/**
 * "Personnes autorisées à récupérer l'élève" + contacts d'urgence. The list is
 * a family-level concern (imported from Dars per parent), stored on the anchor
 * guardian's customAnswers.authorized_persons and shown on each child's fiche.
 * Editable in place when an anchor guardian + save action are available.
 */
export function AuthorizedPersons({
  initial,
  onSave,
}: {
  initial: AuthorizedPerson[];
  /** When absent (no guardian to anchor on, or no permission) → read-only. */
  onSave?: (persons: AuthorizedPerson[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<AuthorizedPerson[]>(initial);
  const [pending, start] = useTransition();

  const authorized = rows.filter((r) => !r.emergency);
  const emergency = rows.filter((r) => r.emergency);

  function set(i: number, patch: Partial<AuthorizedPerson>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRow(emergencyRow: boolean) {
    setRows((p) => [...p, { relation: "", name: "", phone: "", emergency: emergencyRow }]);
  }
  function removeRow(i: number) {
    setRows((p) => p.filter((_, j) => j !== i));
  }
  function cancel() {
    setRows(initial);
    setEditing(false);
  }
  function save() {
    if (!onSave) return;
    const cleaned = rows
      .map((r) => ({
        relation: r.relation.trim(),
        name: r.name.trim(),
        phone: r.phone.trim(),
        emergency: !!r.emergency,
      }))
      .filter((r) => r.name);
    start(async () => {
      const res = await onSave(cleaned);
      if (res.ok) {
        toast.success("Enregistré");
        setRows(cleaned);
        setEditing(false);
      } else {
        toast.error("Échec de l'enregistrement");
      }
    });
  }

  const Group = ({
    title,
    icon,
    people,
  }: {
    title: string;
    icon: React.ReactNode;
    people: AuthorizedPerson[];
  }) => (
    <div className="space-y-2">
      <h5 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
        {icon}
        {title}
      </h5>
      {people.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-subtle)]">—</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[color:var(--color-foreground)]">
                  {p.name}
                </p>
                {p.relation ? (
                  <p className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                    {p.relation}
                  </p>
                ) : null}
              </div>
              {p.phone ? (
                <a
                  href={`tel:${p.phone}`}
                  className="flex shrink-0 items-center gap-1 text-xs text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-brand-600)]"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {p.phone}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          Personnes autorisées à récupérer l'élève
        </h4>
        {onSave ? (
          editing ? (
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
              onClick={() => {
                setRows(initial);
                setEditing(true);
              }}
              aria-label="Modifier"
              className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          )
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="hidden gap-2 px-1 text-[0.7rem] font-medium uppercase tracking-wider text-[color:var(--color-foreground-subtle)] sm:grid sm:grid-cols-[1fr_1fr_8rem_5rem_2rem]">
            <span>Nom</span>
            <span>Relation</span>
            <span>Téléphone</span>
            <span>Urgence</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_8rem_5rem_2rem] sm:items-center"
            >
              <Input
                value={r.name}
                placeholder="Nom complet"
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <Input
                value={r.relation}
                placeholder="Relation (oncle, chauffeur…)"
                onChange={(e) => set(i, { relation: e.target.value })}
              />
              <Input
                value={r.phone}
                placeholder="Téléphone"
                onChange={(e) => set(i, { phone: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                <input
                  type="checkbox"
                  checked={r.emergency}
                  onChange={(e) => set(i, { emergency: e.target.checked })}
                  className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                />
                <span className="sm:hidden">Urgence</span>
              </label>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Supprimer"
                className="inline-flex size-7 items-center justify-center justify-self-start rounded text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-danger-600,#dc2626)]"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addRow(false)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[color:var(--color-border)] px-3 py-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:border-[color:var(--color-brand-500)] hover:text-[color:var(--color-foreground)]"
          >
            <Plus className="size-4" aria-hidden />
            Ajouter une personne
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Group
            title="Personnes autorisées"
            icon={<UserCheck className="size-3.5" aria-hidden />}
            people={authorized}
          />
          <Group
            title="Contacts d'urgence"
            icon={<ShieldAlert className="size-3.5" aria-hidden />}
            people={emergency}
          />
        </div>
      )}
    </div>
  );
}
