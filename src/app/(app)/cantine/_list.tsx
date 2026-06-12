"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  UtensilsCrossed,
  Cookie,
  Check,
  Users,
  FileSpreadsheet,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";

// Collation stops after CM2 — mirrors the module rule.
const COLLATION_EDIT_LEVELS = new Set(["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"]);

export type ServiceRow = {
  id: string;
  name: string;
  family: string;
  className: string;
  level: string;
  collation: boolean;
  cantine: boolean;
};

const PAGE_SIZE = 50;
const LEVEL_ORDER = [
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale",
];
const lvlIdx = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i < 0 ? 99 : i;
};

type SortKey = "name" | "classe" | "collation" | "cantine";

export function ServicesList({
  rows,
  onSet,
}: {
  rows: ServiceRow[];
  onSet: (input: {
    studentId: string;
    cantine: boolean;
    collation: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [service, setService] = useState<"" | "collation" | "cantine" | "both">("");
  const [levelFilter, setLevelFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCollation, setEditCollation] = useState(false);
  const [editCantine, setEditCantine] = useState(false);
  const [pending, start] = useTransition();

  function startEdit(r: ServiceRow) {
    setEditingId(r.id);
    setEditCollation(r.collation);
    setEditCantine(r.cantine);
  }
  function saveEdit(r: ServiceRow) {
    start(async () => {
      const res = await onSet({ studentId: r.id, cantine: editCantine, collation: editCollation });
      if (res.ok) {
        toast.success("Services mis à jour — dossier élève synchronisé");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de l'enregistrement");
      }
    });
  }
  function remove(r: ServiceRow) {
    if (!window.confirm(`Retirer ${r.name} de la cantine/collation pour cette année ?`)) return;
    start(async () => {
      const res = await onSet({ studentId: r.id, cantine: false, collation: false });
      if (res.ok) {
        toast.success(`${r.name} retiré(e) des services de restauration`);
        if (editingId === r.id) setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Échec de la suppression");
      }
    });
  }

  useEffect(() => {
    setPage(1);
  }, [q, service, levelFilter, sort]);

  const levels = useMemo(
    () => [...new Set(rows.map((r) => r.level))].sort((a, b) => lvlIdx(a) - lvlIdx(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (nq && !r.name.toLowerCase().includes(nq)) return false;
      if (levelFilter && r.level !== levelFilter) return false;
      if (service === "collation" && !r.collation) return false;
      if (service === "cantine" && !r.cantine) return false;
      if (service === "both" && !(r.collation && r.cantine)) return false;
      return true;
    });
    const cmp = (a: ServiceRow, b: ServiceRow): number => {
      if (sort) {
        const d = sort.dir;
        switch (sort.key) {
          case "name":
            return d * a.name.localeCompare(b.name);
          case "classe": {
            const li = lvlIdx(a.level) - lvlIdx(b.level);
            return d * (li !== 0 ? li : a.className.localeCompare(b.className));
          }
          case "collation":
            return d * ((b.collation ? 1 : 0) - (a.collation ? 1 : 0));
          case "cantine":
            return d * ((b.cantine ? 1 : 0) - (a.cantine ? 1 : 0));
        }
      }
      const li = lvlIdx(a.level) - lvlIdx(b.level);
      if (li !== 0) return li;
      return a.name.localeCompare(b.name);
    };
    return [...base].sort(cmp);
  }, [rows, q, levelFilter, service, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const nCollation = rows.filter((r) => r.collation).length;
  const nCantine = rows.filter((r) => r.cantine).length;
  const nBoth = rows.filter((r) => r.collation && r.cantine).length;

  function toggleSort(key: SortKey) {
    setSort((p) => (p?.key === key ? (p.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  }
  const SortTh = ({ label, k, center }: { label: string; k: SortKey; center?: boolean }) => (
    <th className={`px-3 py-2 font-semibold ${center ? "text-center" : "text-start"}`}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors duration-150 ease-out hover:text-[color:var(--color-foreground)]"
      >
        {label}
        {sort?.key === k ? (
          sort.dir === 1 ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <Users className="size-4" aria-hidden />, label: "Total élèves", value: fmt(rows.length) },
          { icon: <Cookie className="size-4" aria-hidden />, label: "Collation", value: fmt(nCollation) },
          { icon: <UtensilsCrossed className="size-4" aria-hidden />, label: "Cantine", value: fmt(nCantine) },
          { icon: <Check className="size-4" aria-hidden />, label: "Les deux", value: fmt(nBoth) },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3"
          >
            <span className="shrink-0 text-[color:var(--color-foreground-subtle)]">{s.icon}</span>
            <div className="min-w-0">
              <div className="text-lg font-semibold tabular-nums text-[color:var(--color-foreground)]">{s.value}</div>
              <div className="truncate text-xs text-[color:var(--color-foreground-muted)]">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters on one row — same layout as /students. */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un élève…"
            className="ps-9"
          />
        </div>
        <Select value={service} onChange={(e) => setService(e.target.value as typeof service)}>
          <option value="">Tous les services</option>
          <option value="collation">Collation</option>
          <option value="cantine">Cantine</option>
          <option value="both">Les deux</option>
        </Select>
        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {levels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </Select>
      </div>

      {/* Count + exports */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[color:var(--color-foreground-muted)]">
          <span className="font-medium text-[color:var(--color-foreground)]">{filtered.length}</span> élève(s)
        </span>
        <div className="flex items-center gap-2">
          <a
            href="/cantine/export"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-3 text-sm font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)]"
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel
          </a>
          <a
            href="/cantine/print"
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-3 text-sm font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)]"
          >
            <Printer className="size-4" aria-hidden />
            PDF
          </a>
        </div>
      </div>

      {/* Table — bounded height + sticky header */}
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-[color:var(--color-border-subtle)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)]">
              <SortTh label="Élève" k="name" />
              <SortTh label="Classe" k="classe" />
              <SortTh label="Collation" k="collation" center />
              <SortTh label="Cantine" k="cantine" center />
              <th className="px-3 py-2 text-end font-semibold uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const isEditing = editingId === r.id;
              const collationEditable = COLLATION_EDIT_LEVELS.has(r.level);
              return (
                <tr
                  key={r.id}
                  className={
                    "border-b border-[color:var(--color-border-subtle)] last:border-0 " +
                    (isEditing ? "bg-[color:var(--color-brand-500)]/5" : "hover:bg-[color:var(--color-surface-hover)]")
                  }
                >
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-[color:var(--color-foreground)]">{r.name}</div>
                    {r.family ? (
                      <div className="text-xs text-[color:var(--color-foreground-subtle)]">{r.family}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[color:var(--color-foreground-muted)]">
                    {r.className || r.level || "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editCollation && collationEditable}
                        disabled={!collationEditable}
                        title={collationEditable ? "Collation" : "Collation non offerte après le CM2"}
                        onChange={(e) => setEditCollation(e.target.checked)}
                        className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                      />
                    ) : r.collation ? (
                      <Check className="mx-auto size-4 text-[color:var(--color-brand-600)]" aria-label="Oui" />
                    ) : (
                      <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editCantine}
                        onChange={(e) => setEditCantine(e.target.checked)}
                        className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                      />
                    ) : r.cantine ? (
                      <Check className="mx-auto size-4 text-[color:var(--color-brand-600)]" aria-label="Oui" />
                    ) : (
                      <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-end">
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
                          onClick={() => saveEdit(r)}
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
                          onClick={() => startEdit(r)}
                          disabled={pending}
                          aria-label={`Modifier ${r.name}`}
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(r)}
                          disabled={pending}
                          aria-label={`Retirer ${r.name}`}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
                  Aucun élève ne correspond.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pager — same look as the students / parents tables (50 per page). */}
      {filtered.length > 0 ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <PageBtn disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} label="Précédent" />
            <span className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
              Page {safePage} / {pageCount}
            </span>
            <PageBtn disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} label="Suivant" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageBtn({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "inline-flex items-center rounded-md border border-[color:var(--color-border-subtle)] px-3 py-1.5 text-sm font-medium transition-all duration-150 ease-out " +
        (disabled
          ? "cursor-not-allowed text-[color:var(--color-foreground-subtle)] opacity-50"
          : "bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-foreground)] active:scale-[0.98]")
      }
    >
      {label}
    </button>
  );
}
