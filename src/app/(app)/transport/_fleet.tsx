"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Bus, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";

export type AutocarDto = {
  id: string;
  number: string;
  type: string;
  capacity: string;
  plate: string;
  cylinders: string;
  couleur: string;
  dateAchat: string;
  moteur: string;
  fuel: string;
  modele: string;
  anneeFabrication: string;
  vin: string;
};

type Form = Omit<AutocarDto, "id">;
const EMPTY: Form = {
  number: "", type: "", capacity: "", plate: "", cylinders: "", couleur: "",
  dateAchat: "", moteur: "", fuel: "", modele: "", anneeFabrication: "", vin: "",
};

const TYPE_LABELS: Record<string, string> = { bus: "Bus", minibus: "Mini bus", van: "Van" };
const FUEL_LABELS: Record<string, string> = {
  diesel: "Diesel", essence: "Essence", hybride: "Hybride", electrique: "Électrique",
};

/** "Listes des autocars" — the fleet: add / delete buses with full specs. */
export function FleetView({
  autocars,
  onCreate,
  onUpdate,
  onDelete,
}: {
  autocars: AutocarDto[];
  onCreate: (input: Form) => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (id: string, input: Form) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function submit() {
    if (!form.number.trim()) {
      toast.error("Le numéro d'autocar est obligatoire");
      return;
    }
    start(async () => {
      const res = editingId ? await onUpdate(editingId, form) : await onCreate(form);
      if (res.ok) {
        toast.success(editingId ? `Autocar n° ${form.number} modifié` : `Autocar n° ${form.number} ajouté`);
        setForm(EMPTY);
        setAdding(false);
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de l'enregistrement");
      }
    });
  }

  function startEdit(a: AutocarDto) {
    const { id, ...fields } = a;
    setForm(fields);
    setEditingId(id);
    setAdding(true);
  }

  async function remove(a: AutocarDto) {
    if (
      !(await confirm({
        title: `Supprimer l'autocar n° ${a.number}${a.plate ? ` (${a.plate})` : ""} ?`,
        destructive: true,
      }))
    )
      return;
    start(async () => {
      const res = await onDelete(a.id);
      if (res.ok) {
        toast.success(`Autocar n° ${a.number} supprimé`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de la suppression");
      }
    });
  }

  const sorted = [...autocars].sort((a, b) => Number(a.number) - Number(b.number));

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--color-foreground-muted)]">
      {label}
      {children}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          <span className="font-semibold text-[color:var(--color-foreground)]">{sorted.length}</span> autocar(s) dans la flotte
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setEditingId(null);
            setForm(EMPTY);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-3 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)]"
        >
          {adding ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {adding ? "Annuler" : "Ajouter un autocar"}
        </button>
      </div>

      {adding ? (
        <div className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4 shadow-card">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-foreground)]">
            <Bus className="size-4 text-[color:var(--color-brand-600)]" aria-hidden />
            {editingId ? `Modifier l'autocar n° ${form.number || "?"}` : "Nouvel autocar"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Numéro *">
              <Input value={form.number} onChange={set("number")} placeholder="ex. 25" />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={set("type")}>
                <option value="">—</option>
                <option value="bus">Bus</option>
                <option value="minibus">Mini bus</option>
                <option value="van">Van</option>
              </Select>
            </Field>
            <Field label="Capacité (places)">
              <Input value={form.capacity} onChange={set("capacity")} inputMode="numeric" placeholder="ex. 30" />
            </Field>
            <Field label="Plaque d'immatriculation">
              <Input value={form.plate} onChange={set("plate")} placeholder="ex. B 123456" />
            </Field>
            <Field label="Cylindres">
              <Input value={form.cylinders} onChange={set("cylinders")} inputMode="numeric" placeholder="ex. 6" />
            </Field>
            <Field label="Couleur">
              <Input value={form.couleur} onChange={set("couleur")} placeholder="ex. Jaune" />
            </Field>
            <Field label="Date d'achat">
              <Input type="date" value={form.dateAchat} onChange={set("dateAchat")} />
            </Field>
            <Field label="Moteur">
              <Input value={form.moteur} onChange={set("moteur")} placeholder="ex. OM 904" />
            </Field>
            <Field label="Carburant">
              <Select value={form.fuel} onChange={set("fuel")}>
                <option value="">—</option>
                <option value="diesel">Diesel</option>
                <option value="essence">Essence</option>
                <option value="hybride">Hybride</option>
                <option value="electrique">Électrique</option>
              </Select>
            </Field>
            <Field label="Modèle">
              <Input value={form.modele} onChange={set("modele")} placeholder="ex. Mercedes Sprinter" />
            </Field>
            <Field label="Année de fabrication">
              <Input value={form.anneeFabrication} onChange={set("anneeFabrication")} inputMode="numeric" placeholder="ex. 2019" />
            </Field>
            <Field label="N° VIN (châssis)">
              <Input value={form.vin} onChange={set("vin")} placeholder="ex. WDB9066331S..." />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : editingId ? (
                <Pencil className="size-4" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {editingId ? "Enregistrer les modifications" : "Enregistrer l'autocar"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-auto rounded-lg border border-[color:var(--color-border-subtle)]">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)] [&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold">
              <th>N°</th>
              <th>Type</th>
              <th>Modèle</th>
              <th>Plaque</th>
              <th>Capacité</th>
              <th>Couleur</th>
              <th>Carburant</th>
              <th>Année</th>
              <th>Cylindres</th>
              <th>Moteur</th>
              <th>Date d&apos;achat</th>
              <th>VIN</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr
                key={a.id}
                className="border-b border-[color:var(--color-border-subtle)] last:border-0 hover:bg-[color:var(--color-surface-hover)]"
              >
                <td className="px-3 py-2 font-semibold tabular-nums text-[color:var(--color-foreground)]">{a.number}</td>
                <td className="px-3 py-2 text-[color:var(--color-foreground-muted)]">{TYPE_LABELS[a.type] ?? a.type ?? "—"}</td>
                <td className="px-3 py-2 text-[color:var(--color-foreground-muted)]">{a.modele || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-foreground)]">{a.plate || "—"}</td>
                <td className="px-3 py-2 tabular-nums text-[color:var(--color-foreground-muted)]">{a.capacity || "—"}</td>
                <td className="px-3 py-2 text-[color:var(--color-foreground-muted)]">{a.couleur || "—"}</td>
                <td className="px-3 py-2 text-[color:var(--color-foreground-muted)]">{FUEL_LABELS[a.fuel] ?? a.fuel ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-[color:var(--color-foreground-muted)]">{a.anneeFabrication || "—"}</td>
                <td className="px-3 py-2 tabular-nums text-[color:var(--color-foreground-muted)]">{a.cylinders || "—"}</td>
                <td className="px-3 py-2 text-[color:var(--color-foreground-muted)]">{a.moteur || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-foreground-muted)]">{a.dateAchat || "—"}</td>
                <td className="max-w-[140px] truncate px-3 py-2 text-xs text-[color:var(--color-foreground-subtle)]" title={a.vin}>
                  {a.vin || "—"}
                </td>
                <td className="px-3 py-2 text-end">
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      disabled={pending}
                      aria-label={`Modifier l'autocar ${a.number}`}
                      className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      disabled={pending}
                      aria-label={`Supprimer l'autocar ${a.number}`}
                      className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
                  Aucun autocar — utilise « Ajouter un autocar ».
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
