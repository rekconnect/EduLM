"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  AlertTriangle,
  HeartPulse,
  Stethoscope,
  ArrowRight,
  FileWarning,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Input, Select } from "@/components/ui/input";

export type InfirmerieRow = {
  id: string;
  name: string;
  className: string;
  level: string;
  allergies: string;
  conditions: string[];
  unfitForSports: boolean;
  hasRecord: boolean;
  visits: number;
  immunizations: number;
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

type SortKey = "name" | "classe" | "visites" | "vaccins";

export function InfirmerieList({ rows }: { rows: InfirmerieRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"" | "alerts" | "allergies" | "conditions" | "unfit" | "norecord">("alerts");
  const [levelFilter, setLevelFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [q, filter, levelFilter, sort]);

  const levels = useMemo(
    () => [...new Set(rows.map((r) => r.level).filter(Boolean))].sort((a, b) => lvlIdx(a) - lvlIdx(b)),
    [rows],
  );

  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const nAllergies = rows.filter((r) => r.allergies).length;
  const nConditions = rows.filter((r) => r.conditions.length > 0).length;
  const nRecords = rows.filter((r) => r.hasRecord).length;

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (nq && !r.name.toLowerCase().includes(nq)) return false;
      if (levelFilter && r.level !== levelFilter) return false;
      if (filter === "alerts" && !(r.allergies || r.conditions.length || r.unfitForSports)) return false;
      if (filter === "allergies" && !r.allergies) return false;
      if (filter === "conditions" && r.conditions.length === 0) return false;
      if (filter === "unfit" && !r.unfitForSports) return false;
      if (filter === "norecord" && r.hasRecord) return false;
      return true;
    });
    const cmp = (a: InfirmerieRow, b: InfirmerieRow): number => {
      if (sort) {
        const d = sort.dir;
        switch (sort.key) {
          case "name":
            return d * a.name.localeCompare(b.name);
          case "classe": {
            const li = lvlIdx(a.level) - lvlIdx(b.level);
            return d * (li !== 0 ? li : a.className.localeCompare(b.className));
          }
          case "visites":
            return d * (b.visits - a.visits);
          case "vaccins":
            return d * (b.immunizations - a.immunizations);
        }
      }
      const li = lvlIdx(a.level) - lvlIdx(b.level);
      if (li !== 0) return li;
      return a.name.localeCompare(b.name);
    };
    return [...base].sort(cmp);
  }, [rows, q, filter, levelFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
          { icon: <HeartPulse className="size-4" aria-hidden />, label: "Dossiers médicaux", value: fmt(nRecords) },
          { icon: <AlertTriangle className="size-4" aria-hidden />, label: "Avec allergies", value: fmt(nAllergies) },
          { icon: <Stethoscope className="size-4" aria-hidden />, label: "Conditions chroniques", value: fmt(nConditions) },
          { icon: <FileWarning className="size-4" aria-hidden />, label: "Sans dossier", value: fmt(rows.length - nRecords) },
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
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="alerts">⚠ Avec alerte (allergie / condition / inapte)</option>
          <option value="allergies">Allergies</option>
          <option value="conditions">Conditions chroniques</option>
          <option value="unfit">Inaptes au sport</option>
          <option value="norecord">Sans dossier médical</option>
          <option value="">Tous les élèves</option>
        </Select>
        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {levels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </Select>
      </div>

      <p className="text-xs text-[color:var(--color-foreground-muted)]">
        <span className="font-medium text-[color:var(--color-foreground)]">{filtered.length}</span> élève(s)
      </p>

      {/* Table — bounded height + sticky header */}
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-[color:var(--color-border-subtle)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)]">
              <SortTh label="Élève" k="name" />
              <SortTh label="Classe" k="classe" />
              <th className="px-3 py-2 text-start font-semibold">Allergies</th>
              <th className="px-3 py-2 text-start font-semibold">Conditions</th>
              <SortTh label="Visites" k="visites" center />
              <SortTh label="Vaccins" k="vaccins" center />
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--color-border-subtle)] last:border-0 hover:bg-[color:var(--color-surface-hover)]">
                <td className="px-3 py-1.5 font-medium text-[color:var(--color-foreground)]">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[color:var(--color-foreground-muted)]">{r.className || "—"}</td>
                <td className="max-w-[260px] px-3 py-1.5">
                  {r.allergies ? (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">{r.allergies}</span>
                  ) : (
                    <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {r.conditions.length || r.unfitForSports ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {[...r.conditions, ...(r.unfitForSports ? ["Inapte sport"] : [])].join(", ")}
                    </span>
                  ) : (
                    <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-center tabular-nums text-[color:var(--color-foreground-muted)]">{r.visits || "—"}</td>
                <td className="px-3 py-1.5 text-center tabular-nums text-[color:var(--color-foreground-muted)]">{r.immunizations || "—"}</td>
                <td className="px-3 py-1.5 text-end">
                  <Link
                    href={`/students/${r.id}`}
                    className="inline-flex items-center gap-1 text-xs text-[color:var(--color-brand-600)] hover:underline"
                  >
                    Fiche
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
                  Aucun élève ne correspond.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pager */}
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
