"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Route, Plus, Trash2, Loader2, X, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";

export type CircuitDto = { id: string; autocarNumber: string; activite: string };

/**
 * "Autocar - Circuit" — circuit rows ("8 - Ordinaire") with the number of
 * distinct registered riders this period and the autocar capacity.
 * Add / delete circuits; persons count is computed from the assignments.
 */
export function CircuitsView({
  circuits,
  fleetNumbers,
  persons,
  capacities,
  yearLabel,
  trim,
  onCreate,
  onUpdate,
  onDelete,
}: {
  circuits: CircuitDto[];
  fleetNumbers: string[];
  persons: Record<string, number>;
  capacities: Record<string, string>;
  yearLabel: string;
  trim: string;
  onCreate: (input: { autocarNumber: string; activite: string }) => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (id: string, input: { autocarNumber: string; activite: string }) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [autocarNumber, setAutocarNumber] = useState("");
  const [activite, setActivite] = useState("Ordinaire");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBus, setEditBus] = useState("");
  const [editAct, setEditAct] = useState("");
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  function submit() {
    if (!autocarNumber.trim()) {
      toast.error("Choisis le numéro d'autocar");
      return;
    }
    start(async () => {
      const res = await onCreate({ autocarNumber: autocarNumber.trim(), activite: activite.trim() });
      if (res.ok) {
        toast.success(`Circuit « ${autocarNumber} - ${activite || "Ordinaire"} » ajouté`);
        setAutocarNumber("");
        setActivite("Ordinaire");
        setAdding(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de l'ajout");
      }
    });
  }

  function startEdit(c: CircuitDto) {
    setEditingId(c.id);
    setEditBus(c.autocarNumber);
    setEditAct(c.activite);
  }

  function saveEdit() {
    if (!editingId) return;
    start(async () => {
      const res = await onUpdate(editingId, { autocarNumber: editBus, activite: editAct });
      if (res.ok) {
        toast.success("Circuit modifié");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de la modification");
      }
    });
  }

  async function remove(c: CircuitDto) {
    if (
      !(await confirm({
        title: `Supprimer le circuit « ${c.autocarNumber} - ${c.activite} » ?`,
        destructive: true,
      }))
    )
      return;
    start(async () => {
      const res = await onDelete(c.id);
      if (res.ok) {
        toast.success("Circuit supprimé");
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de la suppression");
      }
    });
  }

  const sorted = [...circuits].sort(
    (a, b) => Number(a.autocarNumber) - Number(b.autocarNumber) || a.activite.localeCompare(b.activite),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm text-[color:var(--color-foreground-muted)]">
          <Route className="size-4 text-[color:var(--color-brand-600)]" aria-hidden />
          <span>
            <span className="font-semibold text-[color:var(--color-foreground)]">{sorted.length}</span> circuit(s) ·{" "}
            {yearLabel} · Trimestre {trim.slice(1)}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-3 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)]"
        >
          {adding ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {adding ? "Annuler" : "Ajouter un circuit"}
        </button>
      </div>

      {adding ? (
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4 shadow-card">
          <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--color-foreground-muted)]">
            N° autocar *
            <Select value={autocarNumber} onChange={(e) => setAutocarNumber(e.target.value)} style={{ width: "9rem" }}>
              <option value="">—</option>
              {fleetNumbers.map((n) => (
                <option key={n} value={n}>Bus {n}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--color-foreground-muted)]">
            Circuit - Activité
            <Input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Ordinaire" style={{ width: "14rem" }} />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Ajouter
          </button>
        </div>
      ) : null}

      <div className="max-w-3xl overflow-auto rounded-lg border border-[color:var(--color-border-subtle)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)] [&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold">
              <th>N° autocar</th>
              <th>Circuit - Activité</th>
              <th className="text-end">Nb de personnes</th>
              <th className="text-end">Capacité</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const count = persons[c.autocarNumber] ?? 0;
              const cap = capacities[c.autocarNumber] ?? "";
              const isEditing = editingId === c.id;
              return (
                <tr
                  key={c.id}
                  className={
                    "border-b border-[color:var(--color-border-subtle)] last:border-0 hover:bg-[color:var(--color-surface-hover)] " +
                    (isEditing ? "bg-[color:var(--color-brand-500)]/5 " : "") +
                    (count === 0 && !isEditing ? "opacity-50" : "")
                  }
                >
                  {isEditing ? (
                    <>
                      <td className="px-2 py-1.5">
                        <Select value={editBus} onChange={(e) => setEditBus(e.target.value)} className="h-8" style={{ width: "7rem" }}>
                          {fleetNumbers.map((n) => (
                            <option key={n} value={n}>Bus {n}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={editAct} onChange={(e) => setEditAct(e.target.value)} placeholder="Ordinaire" className="h-8" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-semibold tabular-nums text-[color:var(--color-foreground)]">{c.autocarNumber}</td>
                      <td className="px-3 py-2 text-[color:var(--color-foreground-muted)]">
                        {c.autocarNumber} - {c.activite}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-end tabular-nums font-medium text-[color:var(--color-foreground)]">{count}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-[color:var(--color-foreground-muted)]">{cap || "—"}</td>
                  <td className="px-3 py-2 text-end">
                    {isEditing ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={pending}
                          aria-label="Annuler"
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={pending}
                          className="inline-flex h-7 items-center gap-1 rounded bg-[color:var(--color-brand-600)] px-2 text-xs font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
                        >
                          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                          OK
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          disabled={pending}
                          aria-label={`Modifier le circuit ${c.autocarNumber} - ${c.activite}`}
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          disabled={pending}
                          aria-label={`Supprimer le circuit ${c.autocarNumber} - ${c.activite}`}
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
                  Aucun circuit — utilise « Ajouter un circuit ».
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[color:var(--color-foreground-subtle)]">
        Nb de personnes = élèves distincts utilisant ce bus (matin, soir ou activité) sur la période. Les lignes grisées n&apos;ont aucun élève actuellement.
      </p>
    </div>
  );
}
