"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Search,
  Bus,
  MapPin,
  Banknote,
  Sunrise,
  Sunset,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  FileSpreadsheet,
  Printer,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import {
  YearPicker,
  UrlSelect,
  type YearOption,
} from "@/components/shell/year-picker";

const PAGE_SIZE = 50;
const ZONES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

export type BusRow = {
  id: string;
  name: string;
  family: string;
  className: string;
  level: string;
  bus_as: string; // "yes" → aller (matin)
  bus_rs: string; // "yes" → retour (soir)
  bus_car_matin: string;
  bus_zoneno_matin: string; // zone 1-10
  bus_zone_matin: string; // quartier
  bus_station_matin: string;
  bus_car_soir: string;
  bus_zoneno_soir: string;
  bus_zone_soir: string;
  bus_station_soir: string;
  bus_activite_matin: string; // "yes" → trajet d'activité (hors circuits ordinaires)
  bus_activite_soir: string;
  bus_remarques: string;
  // Read-only, from the Dars tarif export.
  bus_tel: string;
  bus_montant: string;
  bus_remise: string;
  bus_net: string;
  email_pere: string;
  email_mere: string;
};

type Edit = {
  bus_as: string;
  bus_rs: string;
  bus_car_matin: string;
  bus_zoneno_matin: string;
  bus_zone_matin: string;
  bus_station_matin: string;
  bus_car_soir: string;
  bus_zoneno_soir: string;
  bus_zone_soir: string;
  bus_station_soir: string;
  bus_remarques: string;
};

const LEVEL_ORDER = [
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale",
];
const lvlIdx = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i < 0 ? 99 : i;
};
const busNum = (v: string) => {
  const n = Number(v.trim());
  return v.trim() === "" ? Number.POSITIVE_INFINITY : Number.isFinite(n) ? n : 9e8;
};
const pick = (r: BusRow): Edit => ({
  bus_as: r.bus_as,
  bus_rs: r.bus_rs,
  bus_car_matin: r.bus_car_matin,
  bus_zoneno_matin: r.bus_zoneno_matin,
  bus_zone_matin: r.bus_zone_matin,
  bus_station_matin: r.bus_station_matin,
  bus_car_soir: r.bus_car_soir,
  bus_zoneno_soir: r.bus_zoneno_soir,
  bus_zone_soir: r.bus_zone_soir,
  bus_station_soir: r.bus_station_soir,
  bus_remarques: r.bus_remarques,
});

type SortKey =
  | "name"
  | "classe"
  | "as"
  | "rs"
  | "bus_matin"
  | "zone_matin"
  | "bus_soir"
  | "zone_soir";

export function TransportManager({
  rows,
  years,
  selectedYearId,
  trim,
  onSave,
  onDelete,
}: {
  rows: BusRow[];
  years: YearOption[];
  selectedYearId: string;
  trim: string;
  onSave: (
    updates: Array<{ studentId: string } & Edit>,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (studentId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [zonenoFilter, setZonenoFilter] = useState("");
  const [busFilter, setBusFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [trajetFilter, setTrajetFilter] = useState("");
  const [circuitFilter, setCircuitFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  // Row-level editing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Edit | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setPage(1);
  }, [q, zoneFilter, zonenoFilter, busFilter, levelFilter, trajetFilter, circuitFilter, sort, rows]);

  const exportQs = (() => {
    const sp = new URLSearchParams({ yearId: selectedYearId, trim });
    if (q.trim()) sp.set("q", q.trim());
    if (busFilter) sp.set("bus", busFilter);
    if (zonenoFilter) sp.set("zoneno", zonenoFilter);
    if (zoneFilter) sp.set("zone", zoneFilter);
    if (levelFilter) sp.set("niveau", levelFilter);
    if (trajetFilter) sp.set("trajet", trajetFilter);
    if (circuitFilter) sp.set("circuit", circuitFilter);
    return `?${sp.toString()}`;
  })();

  const quartiers = useMemo(
    () =>
      [...new Set(
        rows.flatMap((r) => [r.bus_zone_matin.trim(), r.bus_zone_soir.trim()]).filter(Boolean),
      )].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const buses = useMemo(
    () =>
      [...new Set(
        rows.flatMap((r) => [r.bus_car_matin.trim(), r.bus_car_soir.trim()]).filter(Boolean),
      )].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    [rows],
  );
  const levels = useMemo(
    () => [...new Set(rows.map((r) => r.level))].sort((a, b) => lvlIdx(a) - lvlIdx(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (nq && !r.name.toLowerCase().includes(nq)) return false;
      if (levelFilter && r.level !== levelFilter) return false;
      const rowZones = [r.bus_zone_matin.trim(), r.bus_zone_soir.trim()];
      if (zoneFilter === "__none__" && rowZones.some(Boolean)) return false;
      if (zoneFilter && zoneFilter !== "__none__" && !rowZones.includes(zoneFilter)) return false;
      if (
        zonenoFilter &&
        ![r.bus_zoneno_matin.trim(), r.bus_zoneno_soir.trim()].includes(zonenoFilter)
      )
        return false;
      const rowBuses = [r.bus_car_matin.trim(), r.bus_car_soir.trim()];
      if (busFilter === "__none__" && rowBuses.some(Boolean)) return false;
      if (busFilter && busFilter !== "__none__" && !rowBuses.includes(busFilter)) return false;
      const as = r.bus_as === "yes";
      const rs = r.bus_rs === "yes";
      const sameBus = r.bus_car_matin.trim() === r.bus_car_soir.trim();
      if (trajetFilter === "AS" && !(as && !rs)) return false;
      if (trajetFilter === "RS" && !(rs && !as)) return false;
      if (trajetFilter === "AR" && !(as && rs)) return false;
      if (trajetFilter === "AR1" && !(as && rs && sameBus)) return false;
      if (trajetFilter === "AR2" && !(as && rs && !sameBus)) return false;
      if (trajetFilter === "__none__" && (as || rs)) return false;
      const hasActivite =
        (as && r.bus_activite_matin === "yes") || (rs && r.bus_activite_soir === "yes");
      if (circuitFilter === "activite" && !hasActivite) return false;
      if (circuitFilter === "ordinaire" && hasActivite) return false;
      return true;
    });
    const cmp = (a: BusRow, b: BusRow): number => {
      if (sort) {
        const d = sort.dir;
        switch (sort.key) {
          case "name":
            return d * a.name.localeCompare(b.name);
          case "classe": {
            const li = lvlIdx(a.level) - lvlIdx(b.level);
            return d * (li !== 0 ? li : a.className.localeCompare(b.className));
          }
          case "as":
            return d * ((b.bus_as === "yes" ? 1 : 0) - (a.bus_as === "yes" ? 1 : 0));
          case "rs":
            return d * ((b.bus_rs === "yes" ? 1 : 0) - (a.bus_rs === "yes" ? 1 : 0));
          case "bus_matin":
            return d * (busNum(a.bus_car_matin) - busNum(b.bus_car_matin));
          case "zone_matin":
            return d * a.bus_zone_matin.localeCompare(b.bus_zone_matin);
          case "bus_soir":
            return d * (busNum(a.bus_car_soir) - busNum(b.bus_car_soir));
          case "zone_soir":
            return d * a.bus_zone_soir.localeCompare(b.bus_zone_soir);
        }
      }
      const bm = busNum(a.bus_car_matin) - busNum(b.bus_car_matin);
      if (bm !== 0) return bm;
      const z = (a.bus_zone_matin || a.bus_zone_soir).localeCompare(
        b.bus_zone_matin || b.bus_zone_soir,
      );
      if (z !== 0) return z;
      const li = lvlIdx(a.level) - lvlIdx(b.level);
      if (li !== 0) return li;
      return a.name.localeCompare(b.name);
    };
    return [...base].sort(cmp);
  }, [rows, q, levelFilter, zoneFilter, zonenoFilter, busFilter, trajetFilter, circuitFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Stats.
  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const asTotal = rows.filter((r) => r.bus_as === "yes").length;
  const rsTotal = rows.filter((r) => r.bus_rs === "yes").length;
  const both = rows.filter((r) => r.bus_as === "yes" && r.bus_rs === "yes");
  const allerRetour = both.filter(
    (r) => r.bus_car_matin.trim() === r.bus_car_soir.trim(),
  ).length;
  const asPlusRs = both.length - allerRetour;
  const montantTotal = rows.reduce((acc, r) => acc + (Number(r.bus_montant) || 0), 0);
  const netTotal = rows.reduce(
    // "0" is a real net (exonéré 100%) — only fall back when net is empty.
    (acc, r) => acc + (r.bus_net.trim() !== "" ? Number(r.bus_net) || 0 : Number(r.bus_montant) || 0),
    0,
  );
  const remises = rows.filter((r) => Number(r.bus_remise) > 0).length;
  const assigned = rows.filter(
    (r) => r.bus_car_matin.trim() || r.bus_car_soir.trim(),
  ).length;
  const noZone = rows.filter(
    (r) => !(r.bus_zone_matin.trim() || r.bus_zone_soir.trim()),
  ).length;

  function startEdit(r: BusRow) {
    setEditingId(r.id);
    setForm(pick(r));
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }
  function set(k: keyof Edit, v: string) {
    setForm((p) => (p ? { ...p, [k]: v } : p));
  }
  function saveRow() {
    if (!editingId || !form) return;
    start(async () => {
      const res = await onSave([{ studentId: editingId, ...form }]);
      if (res.ok) {
        toast.success("Enregistré");
        cancelEdit();
        router.refresh();
      } else {
        toast.error("Échec de l'enregistrement");
      }
    });
  }
  function deleteRow(r: BusRow) {
    if (
      !window.confirm(
        `Supprimer l'affectation bus de ${r.name} pour ce trimestre ?\n(Trajets, bus, zones et montants de la période seront retirés.)`,
      )
    )
      return;
    start(async () => {
      const res = await onDelete(r.id);
      if (res.ok) {
        toast.success("Affectation supprimée");
        if (editingId === r.id) cancelEdit();
        router.refresh();
      } else {
        toast.error("Échec de la suppression");
      }
    });
  }

  function toggleSort(key: SortKey) {
    setSort((p) => (p?.key === key ? (p.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  }
  const SortTh = ({
    label,
    k,
    className,
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) => (
    <th className={"px-3 py-2 text-start font-semibold " + (className ?? "")}>
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

  const ZoneSelect = ({ k }: { k: "bus_zoneno_matin" | "bus_zoneno_soir" }) => (
    <Select value={form?.[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="h-8">
      <option value="">—</option>
      {ZONES.map((z) => (
        <option key={z} value={z}>{z}</option>
      ))}
    </Select>
  );
  const QuartierSelect = ({ k }: { k: "bus_zone_matin" | "bus_zone_soir" }) => (
    <Select value={form?.[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="h-8">
      <option value="">—</option>
      {/* keep a non-listed current value selectable */}
      {form?.[k] && !quartiers.includes(form[k]) ? (
        <option value={form[k]}>{form[k]}</option>
      ) : null}
      {quartiers.map((qt) => (
        <option key={qt} value={qt}>{qt}</option>
      ))}
    </Select>
  );

  const dirText = (car: string, zoneno: string, quartier: string, station: string) =>
    [car && `Bus ${car}`, zoneno && `Z${zoneno}`, quartier, station]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {[
          { icon: <Bus className="size-4" aria-hidden />, label: "Inscrits au bus", value: fmt(rows.length) },
          { icon: <Sunrise className="size-4" aria-hidden />, label: "Aller (AS)", value: fmt(asTotal) },
          { icon: <Sunset className="size-4" aria-hidden />, label: "Retour (RS)", value: fmt(rsTotal) },
          {
            icon: <ArrowLeftRight className="size-4" aria-hidden />,
            label: `Aller-Retour · ${fmt(allerRetour)} même bus / ${fmt(asPlusRs)} avec 2 bus`,
            value: fmt(both.length),
          },
          {
            icon: <Banknote className="size-4" aria-hidden />,
            label: `Net après remises · brut ${fmt(montantTotal)} $ · ${fmt(remises)} remise(s)`,
            value: `${fmt(netTotal)} $`,
          },
          { icon: <Check className="size-4" aria-hidden />, label: "Avec bus assigné", value: fmt(assigned) },
          { icon: <MapPin className="size-4" aria-hidden />, label: "Sans quartier", value: fmt(noZone) },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3"
          >
            <span className="shrink-0 text-[color:var(--color-foreground-subtle)]">{s.icon}</span>
            <div className="min-w-0">
              <div className="text-lg font-semibold tabular-nums text-[color:var(--color-foreground)]">{s.value}</div>
              <div className="truncate text-xs text-[color:var(--color-foreground-muted)]" title={s.label}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + period (own row, full-width search) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
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
        <div className="flex shrink-0 gap-2">
          <YearPicker years={years} selectedId={selectedYearId} />
          <UrlSelect
            name="trim"
            value={trim}
            options={[
              { value: "T1", label: "Trimestre 1" },
              { value: "T2", label: "Trimestre 2" },
              { value: "T3", label: "Trimestre 3" },
            ]}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={circuitFilter} onChange={(e) => setCircuitFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">Ordinaire + activité</option>
          <option value="ordinaire">Circuits ordinaires</option>
          <option value="activite">Trajets d&apos;activité</option>
        </Select>
        <Select value={trajetFilter} onChange={(e) => setTrajetFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">Tous les trajets</option>
          <option value="AS">Aller seul (AS)</option>
          <option value="RS">Retour seul (RS)</option>
          <option value="AR">Aller-Retour (tous)</option>
          <option value="AR1">Aller-Retour — même bus</option>
          <option value="AR2">Aller-Retour — 2 bus différents</option>
          <option value="__none__">— Sans trajet —</option>
        </Select>
        <Select value={busFilter} onChange={(e) => setBusFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">Tous les bus</option>
          <option value="__none__">— Sans bus —</option>
          {buses.map((c) => (
            <option key={c} value={c}>Bus {c}</option>
          ))}
        </Select>
        <Select value={zonenoFilter} onChange={(e) => setZonenoFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">Toutes les zones</option>
          {ZONES.map((z) => (
            <option key={z} value={z}>Zone {z}</option>
          ))}
        </Select>
        <Select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">Tous les quartiers</option>
          <option value="__none__">— Sans quartier —</option>
          {quartiers.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </Select>
        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ width: "auto" }}>
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
            href={`/transport/export${exportQs}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-3 text-sm font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)]"
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel
          </a>
          <a
            href={`/transport/print${exportQs}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-3 text-sm font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)]"
          >
            <Printer className="size-4" aria-hidden />
            PDF
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-[color:var(--color-border-subtle)]">
        <table className="w-full min-w-[1980px] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-8 [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)]">
              <th className="px-3" colSpan={2} />
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 text-start font-semibold" colSpan={5}>
                <span className="inline-flex items-center gap-1"><Sunrise className="size-3.5" aria-hidden /> AS — Aller (matin)</span>
              </th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 text-start font-semibold" colSpan={5}>
                <span className="inline-flex items-center gap-1"><Sunset className="size-3.5" aria-hidden /> RS — Retour (soir)</span>
              </th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 text-start font-semibold" colSpan={5}>
                Contacts & facturation
              </th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3" colSpan={2} />
            </tr>
            <tr className="text-start text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:sticky [&>th]:top-8 [&>th]:z-10 [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)]">
              <SortTh label="Élève" k="name" />
              <SortTh label="Classe" k="classe" />
              <SortTh label="AS" k="as" className="border-s border-[color:var(--color-border-subtle)]" />
              <SortTh label="Bus N°" k="bus_matin" />
              <th className="px-3 py-2 text-start font-semibold">Zone</th>
              <SortTh label="Quartier" k="zone_matin" />
              <th className="px-3 py-2 text-start font-semibold">Station</th>
              <SortTh label="RS" k="rs" className="border-s border-[color:var(--color-border-subtle)]" />
              <SortTh label="Bus N°" k="bus_soir" />
              <th className="px-3 py-2 text-start font-semibold">Zone</th>
              <SortTh label="Quartier" k="zone_soir" />
              <th className="px-3 py-2 text-start font-semibold">Station</th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 py-2 text-start font-semibold">Tel</th>
              <th className="px-3 py-2 text-start font-semibold">Emails</th>
              <th className="px-3 py-2 text-start font-semibold">Montant</th>
              <th className="px-3 py-2 text-start font-semibold">Remise</th>
              <th className="px-3 py-2 text-start font-semibold">Net</th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 py-2 text-start font-semibold">Remarques</th>
              <th className="px-3 py-2 text-end font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const isEditing = editingId === r.id && form;
              const as = isEditing ? form!.bus_as === "yes" : r.bus_as === "yes";
              const rs = isEditing ? form!.bus_rs === "yes" : r.bus_rs === "yes";
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

                  {/* ── AS (matin) ── */}
                  <td className="w-12 border-s border-[color:var(--color-border-subtle)] px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={as}
                        aria-label="Aller (AS)"
                        onChange={(ev) => set("bus_as", ev.target.checked ? "yes" : "")}
                        className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                      />
                    ) : as ? (
                      r.bus_activite_matin === "yes" ? (
                        <span
                          title="Trajet d'activité (hors circuits ordinaires)"
                          className="mx-auto inline-flex size-5 items-center justify-center rounded bg-amber-500/15 text-[11px] font-bold text-amber-600 dark:text-amber-400"
                        >
                          A
                        </span>
                      ) : (
                        <Check className="mx-auto size-4 text-[color:var(--color-brand-600)]" aria-label="Oui" />
                      )
                    ) : (
                      <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                    )}
                  </td>
                  {isEditing && as ? (
                    <>
                      <td className="w-16 px-2 py-1.5">
                        <Input value={form!.bus_car_matin} placeholder="—" onChange={(ev) => set("bus_car_matin", ev.target.value)} className="h-8" />
                      </td>
                      <td className="w-20 px-2 py-1.5"><ZoneSelect k="bus_zoneno_matin" /></td>
                      <td className="w-40 px-2 py-1.5"><QuartierSelect k="bus_zone_matin" /></td>
                      <td className="w-40 px-2 py-1.5">
                        <Input value={form!.bus_station_matin} placeholder="Station" onChange={(ev) => set("bus_station_matin", ev.target.value)} className="h-8" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[color:var(--color-foreground)]">
                        {as && r.bus_car_matin ? r.bus_car_matin : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[color:var(--color-foreground-muted)]">
                        {as && r.bus_zoneno_matin ? r.bus_zoneno_matin : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-[color:var(--color-foreground-muted)]">
                        {as && r.bus_zone_matin ? r.bus_zone_matin : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-1.5 text-xs text-[color:var(--color-foreground-muted)]" title={r.bus_station_matin}>
                        {as && r.bus_station_matin ? r.bus_station_matin : "—"}
                      </td>
                    </>
                  )}

                  {/* ── RS (soir) ── */}
                  <td className="w-12 border-s border-[color:var(--color-border-subtle)] px-3 py-1.5 text-center">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={rs}
                        aria-label="Retour (RS)"
                        onChange={(ev) => set("bus_rs", ev.target.checked ? "yes" : "")}
                        className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                      />
                    ) : rs ? (
                      r.bus_activite_soir === "yes" ? (
                        <span
                          title="Trajet d'activité (hors circuits ordinaires)"
                          className="mx-auto inline-flex size-5 items-center justify-center rounded bg-amber-500/15 text-[11px] font-bold text-amber-600 dark:text-amber-400"
                        >
                          A
                        </span>
                      ) : (
                        <Check className="mx-auto size-4 text-[color:var(--color-brand-600)]" aria-label="Oui" />
                      )
                    ) : (
                      <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                    )}
                  </td>
                  {isEditing && rs ? (
                    <>
                      <td className="w-16 px-2 py-1.5">
                        <Input value={form!.bus_car_soir} placeholder="—" onChange={(ev) => set("bus_car_soir", ev.target.value)} className="h-8" />
                      </td>
                      <td className="w-20 px-2 py-1.5"><ZoneSelect k="bus_zoneno_soir" /></td>
                      <td className="w-40 px-2 py-1.5"><QuartierSelect k="bus_zone_soir" /></td>
                      <td className="w-40 px-2 py-1.5">
                        <Input value={form!.bus_station_soir} placeholder="Station" onChange={(ev) => set("bus_station_soir", ev.target.value)} className="h-8" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[color:var(--color-foreground)]">
                        {rs && r.bus_car_soir ? r.bus_car_soir : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[color:var(--color-foreground-muted)]">
                        {rs && r.bus_zoneno_soir ? r.bus_zoneno_soir : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-[color:var(--color-foreground-muted)]">
                        {rs && r.bus_zone_soir ? r.bus_zone_soir : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-1.5 text-xs text-[color:var(--color-foreground-muted)]" title={r.bus_station_soir}>
                        {rs && r.bus_station_soir ? r.bus_station_soir : "—"}
                      </td>
                    </>
                  )}

                  {/* ── Contacts & facturation (read-only) ── */}
                  <td className="w-36 whitespace-nowrap border-s border-[color:var(--color-border-subtle)] px-3 py-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                    {r.bus_tel || "—"}
                  </td>
                  <td className="w-52 px-3 py-1.5 text-xs leading-tight text-[color:var(--color-foreground-muted)]">
                    {r.email_pere || r.email_mere ? (
                      <>
                        {r.email_pere ? (
                          <a href={`mailto:${r.email_pere}`} className="block truncate hover:text-[color:var(--color-brand-600)] hover:underline">
                            {r.email_pere}
                          </a>
                        ) : null}
                        {r.email_mere && r.email_mere !== r.email_pere ? (
                          <a href={`mailto:${r.email_mere}`} className="block truncate hover:text-[color:var(--color-brand-600)] hover:underline">
                            {r.email_mere}
                          </a>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="w-20 px-3 py-1.5 text-end tabular-nums text-[color:var(--color-foreground-muted)]">
                    {r.bus_montant || "—"}
                  </td>
                  <td
                    className={
                      "w-16 px-3 py-1.5 text-end tabular-nums " +
                      (Number(r.bus_remise) > 0
                        ? "font-semibold text-amber-600 dark:text-amber-400"
                        : "text-[color:var(--color-foreground-subtle)]")
                    }
                  >
                    {Number(r.bus_remise) > 0 ? `${r.bus_remise}%` : "—"}
                  </td>
                  <td className="w-20 px-3 py-1.5 text-end tabular-nums font-medium text-[color:var(--color-foreground)]">
                    {r.bus_net.trim() !== "" ? r.bus_net : r.bus_montant || "—"}
                  </td>

                  {/* ── Remarques + actions ── */}
                  <td className="w-44 border-s border-[color:var(--color-border-subtle)] px-2 py-1.5">
                    {isEditing ? (
                      <Input value={form!.bus_remarques} placeholder="—" onChange={(ev) => set("bus_remarques", ev.target.value)} className="h-8" />
                    ) : (
                      <span className="block max-w-[170px] truncate text-xs text-[color:var(--color-foreground-muted)]" title={r.bus_remarques}>
                        {r.bus_remarques || "—"}
                      </span>
                    )}
                  </td>
                  <td className="w-24 px-2 py-1.5 text-end">
                    {isEditing ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={pending}
                          aria-label="Annuler"
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={saveRow}
                          disabled={pending}
                          className="inline-flex h-7 items-center gap-1 rounded bg-[color:var(--color-brand-600)] px-2 text-xs font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
                        >
                          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                          OK
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1">
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
                          onClick={() => deleteRow(r)}
                          disabled={pending}
                          aria-label={`Supprimer l'affectation de ${r.name}`}
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={19} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
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
