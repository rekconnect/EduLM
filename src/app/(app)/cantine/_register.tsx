"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";

export type CantineCandidate = {
  id: string;
  name: string;
  className: string;
  level: string;
  hasCantine: boolean;
  hasCollation: boolean;
};

// Collation stops after CM2 — mirrors the module/fiche rule.
const COLLATION_LEVELS = new Set(["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"]);

/** "Inscrire un élève" panel for the Cantine / Collation module — the
 *  registration also shows up on the student dossier (services). */
export function CantineRegister({
  candidates,
  onRegister,
}: {
  candidates: CantineCandidate[];
  onRegister: (input: {
    studentId: string;
    cantine: boolean;
    collation: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [cantine, setCantine] = useState(true);
  const [collation, setCollation] = useState(false);
  const [pending, start] = useTransition();

  const selected = candidates.find((c) => c.id === studentId);
  const collationOffered = selected ? COLLATION_LEVELS.has(selected.level) : true;

  function submit() {
    if (!studentId) {
      toast.error("Choisis un élève");
      return;
    }
    const wantCollation = collation && collationOffered;
    if (!cantine && !wantCollation) {
      toast.error("Choisis cantine, collation ou les deux");
      return;
    }
    start(async () => {
      const res = await onRegister({ studentId, cantine, collation: wantCollation });
      if (res.ok) {
        toast.success("Élève inscrit — visible aussi sur son dossier");
        setOpen(false);
        setQuery("");
        setStudentId("");
        setCantine(true);
        setCollation(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de l'inscription");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-3 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)]"
        >
          {open ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {open ? "Annuler" : "Inscrire un élève"}
        </button>
      </div>
      {open ? (
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4 shadow-card">
          <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--color-foreground-muted)]">
            Rechercher
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setStudentId("");
              }}
              placeholder="Nom de l'élève…"
              style={{ width: "14rem" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--color-foreground-muted)]">
            Élève
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ width: "20rem" }}>
              <option value="">— Choisir —</option>
              {candidates
                .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
                .slice(0, 80)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.className ? ` (${c.className})` : ""}
                    {c.hasCantine ? " — a déjà la cantine" : c.hasCollation ? " — a déjà la collation" : ""}
                  </option>
                ))}
            </Select>
          </label>
          <label className="inline-flex items-center gap-2 pb-2 text-sm text-[color:var(--color-foreground)]">
            <input
              type="checkbox"
              checked={cantine && !(selected?.hasCantine ?? false)}
              disabled={selected?.hasCantine ?? false}
              onChange={(e) => setCantine(e.target.checked)}
              className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
            />
            Cantine (repas chaud)
          </label>
          <label
            className={
              "inline-flex items-center gap-2 pb-2 text-sm " +
              (collationOffered ? "text-[color:var(--color-foreground)]" : "text-[color:var(--color-foreground-subtle)]")
            }
            title={collationOffered ? undefined : "Collation non offerte après le CM2"}
          >
            <input
              type="checkbox"
              checked={collation && collationOffered && !(selected?.hasCollation ?? false)}
              disabled={!collationOffered || (selected?.hasCollation ?? false)}
              onChange={(e) => setCollation(e.target.checked)}
              className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
            />
            Collation
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Inscrire
          </button>
          <p className="basis-full text-xs text-[color:var(--color-foreground-subtle)]">
            L&apos;inscription est ajoutée aux services de l&apos;année active et apparaît immédiatement sur le dossier de l&apos;élève.
          </p>
        </div>
      ) : null}
    </div>
  );
}
