"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Loader2,
  Search,
  Save,
  Bus,
  MapPin,
  Sunrise,
  Sunset,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Banknote,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";
import {
  YearPicker,
  UrlSelect,
  type YearOption,
} from "@/components/shell/year-picker";

const PAGE_SIZE = 50;

export type BusRow = {
  id: string;
  name: string;
  family: string;
  className: string;
  level: string;
  bus_as: string; // "yes" → aller (matin)
  bus_rs: string; // "yes" → retour (soir)
  bus_car_matin: string;
  bus_zone_matin: string;
  bus_station_matin: string;
  bus_car_soir: string;
  bus_zone_soir: string;
  bus_station_soir: string;
  bus_remarques: string;
  // Read-only, from the Dars manifests (re-imported each export).
  bus_tel: string;
  bus_montant: string;
  bus_paye: string;
};

type Edit = Omit<
  BusRow,
  "id" | "name" | "family" | "className" | "level" | "bus_tel" | "bus_montant" | "bus_paye"
>;

const KEYS: Array<keyof Edit> = [
  "bus_as",
  "bus_rs",
  "bus_car_matin",
  "bus_zone_matin",
  "bus_station_matin",
  "bus_car_soir",
  "bus_zone_soir",
  "bus_station_soir",
  "bus_remarques",
];

const LEVEL_ORDER = [
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale",
];
const lvlIdx = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i < 0 ? 99 : i;
};
const EMPTY: Edit = {
  bus_as: "",
  bus_rs: "",
  bus_car_matin: "",
  bus_zone_matin: "",
  bus_station_matin: "",
  bus_car_soir: "",
  bus_zone_soir: "",
  bus_station_soir: "",
  bus_remarques: "",
};
const pick = (r: BusRow): Edit => ({
  bus_as: r.bus_as,
  bus_rs: r.bus_rs,
  bus_car_matin: r.bus_car_matin,
  bus_zone_matin: r.bus_zone_matin,
  bus_station_matin: r.bus_station_matin,
  bus_car_soir: r.bus_car_soir,
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

const busNum = (v: string) => {
  const n = Number(v.trim());
  // empty buses sort last regardless of direction
  return v.trim() === "" ? Number.POSITIVE_INFINITY : Number.isFinite(n) ? n : 9e8;
};

export function TransportManager({
  rows,
  years,
  selectedYearId,
  trim,
  onSave,
}: {
  rows: BusRow[];
  years: YearOption[];
  selectedYearId: string;
  trim: string;
  onSave: (
    updates: Array<{ studentId: string } & Edit>,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, pick(r)])),
  );
  const [q, setQ] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [busFilter, setBusFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [trajetFilter, setTrajetFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();

  // New period (year / trimester) → new rows from the server: reseed edits.
  useEffect(() => {
    setEdits(Object.fromEntries(rows.map((r) => [r.id, pick(r)])));
  }, [rows]);

  // Back to page 1 whenever the visible set changes shape.
  useEffect(() => {
    setPage(1);
  }, [q, zoneFilter, busFilter, levelFilter, trajetFilter, sort, rows]);

  const exportQs = `?yearId=${encodeURIComponent(selectedYearId)}&trim=${encodeURIComponent(trim)}`;

  const original = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, pick(r)])),
    [rows],
  );
  const set = (id: string, k: keyof Edit, v: string) =>
    setEdits((p) => ({ ...p, [id]: { ...(p[id] ?? EMPTY), [k]: v } }));
  const e0 = (id: string): Edit => edits[id] ?? EMPTY;

  const dirtyIds = useMemo(
    () =>
      rows
        .filter((r) => {
          const e = edits[r.id];
          const o = original[r.id];
          if (!e || !o) return false;
          return KEYS.some((k) => e[k] !== o[k]);
        })
        .map((r) => r.id),
    [rows, edits, original],
  );

  const zones = useMemo(
    () =>
      [...new Set(
        rows.flatMap((r) => [e0(r.id).bus_zone_matin.trim(), e0(r.id).bus_zone_soir.trim()]).filter(Boolean),
      )].sort((a, b) => a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, edits],
  );
  const buses = useMemo(
    () =>
      [...new Set(
        rows.flatMap((r) => [e0(r.id).bus_car_matin.trim(), e0(r.id).bus_car_soir.trim()]).filter(Boolean),
      )].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, edits],
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
      const e = e0(r.id);
      const rowZones = [e.bus_zone_matin.trim(), e.bus_zone_soir.trim()];
      if (zoneFilter === "__none__" && rowZones.some(Boolean)) return false;
      if (zoneFilter && zoneFilter !== "__none__" && !rowZones.includes(zoneFilter)) return false;
      const rowBuses = [e.bus_car_matin.trim(), e.bus_car_soir.trim()];
      if (busFilter === "__none__" && rowBuses.some(Boolean)) return false;
      if (busFilter && busFilter !== "__none__" && !rowBuses.includes(busFilter)) return false;
      const as = e.bus_as === "yes";
      const rs = e.bus_rs === "yes";
      const sameBus = e.bus_car_matin.trim() === e.bus_car_soir.trim();
      if (trajetFilter === "AS" && !(as && !rs)) return false;
      if (trajetFilter === "RS" && !(rs && !as)) return false;
      if (trajetFilter === "AR" && !(as && rs)) return false;
      if (trajetFilter === "AR1" && !(as && rs && sameBus)) return false;
      if (trajetFilter === "AR2" && !(as && rs && !sameBus)) return false;
      if (trajetFilter === "__none__" && (as || rs)) return false;
      return true;
    });

    const cmp = (a: BusRow, b: BusRow): number => {
      const ea = e0(a.id);
      const eb = e0(b.id);
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
            return d * ((eb.bus_as === "yes" ? 1 : 0) - (ea.bus_as === "yes" ? 1 : 0));
          case "rs":
            return d * ((eb.bus_rs === "yes" ? 1 : 0) - (ea.bus_rs === "yes" ? 1 : 0));
          case "bus_matin":
            return d * (busNum(ea.bus_car_matin) - busNum(eb.bus_car_matin));
          case "zone_matin":
            return d * ea.bus_zone_matin.localeCompare(eb.bus_zone_matin);
          case "bus_soir":
            return d * (busNum(ea.bus_car_soir) - busNum(eb.bus_car_soir));
          case "zone_soir":
            return d * ea.bus_zone_soir.localeCompare(eb.bus_zone_soir);
        }
      }
      // Default: bus matin, then zone, then level, then name.
      const bm = busNum(ea.bus_car_matin) - busNum(eb.bus_car_matin);
      if (bm !== 0) return bm;
      const z = (ea.bus_zone_matin || ea.bus_zone_soir).localeCompare(eb.bus_zone_matin || eb.bus_zone_soir);
      if (z !== 0) return z;
      const li = lvlIdx(a.level) - lvlIdx(b.level);
      if (li !== 0) return li;
      return a.name.localeCompare(b.name);
    };
    return [...base].sort(cmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, levelFilter, zoneFilter, busFilter, trajetFilter, edits, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const assigned = rows.filter(
    (r) => e0(r.id).bus_car_matin.trim() || e0(r.id).bus_car_soir.trim(),
  ).length;
  const noZone = rows.filter(
    (r) => !(e0(r.id).bus_zone_matin.trim() || e0(r.id).bus_zone_soir.trim()),
  ).length;
  // Direction totals (Dars-dashboard semantics: aller/retour each count every
  // rider of that leg, AR included) — live, follows unsaved checkbox edits.
  const asTotal = rows.filter((r) => e0(r.id).bus_as === "yes").length;
  const rsTotal = rows.filter((r) => e0(r.id).bus_rs === "yes").length;
  // "Aller-Retour" à la Dars = the SAME bus both ways (an AR subscription).
  // Riding two different buses = two separate AS + RS subscriptions.
  const both = rows.filter(
    (r) => e0(r.id).bus_as === "yes" && e0(r.id).bus_rs === "yes",
  );
  const allerRetour = both.filter(
    (r) => e0(r.id).bus_car_matin.trim() === e0(r.id).bus_car_soir.trim(),
  ).length;
  const asPlusRs = both.length - allerRetour;
  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const montantTotal = rows.reduce((acc, r) => acc + (Number(r.bus_montant) || 0), 0);
  const payeTotal = rows.reduce((acc, r) => acc + (Number(r.bus_paye) || 0), 0);

  function save() {
    const updates = dirtyIds.map((id) => ({ studentId: id, ...(edits[id] ?? EMPTY) }));
    if (updates.length === 0) return;
    start(async () => {
      const res = await onSave(updates);
      if (res.ok) toast.success(`${updates.length} affectation(s) enregistrée(s)`);
      else toast.error("Échec de l'enregistrement");
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
            label: `Montant total · payé ${fmt(payeTotal)} $`,
            value: `${fmt(montantTotal)} $`,
          },
          { icon: <Save className="size-4" aria-hidden />, label: "Avec bus assigné", value: fmt(assigned) },
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

      {/* Search + filters on one row — same layout as /students. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1fr_repeat(6,auto)]">
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
        <Select value={trajetFilter} onChange={(e) => setTrajetFilter(e.target.value)}>
          <option value="">Tous les trajets</option>
          <option value="AS">Aller seul (AS)</option>
          <option value="RS">Retour seul (RS)</option>
          <option value="AR">Aller-Retour (tous)</option>
          <option value="AR1">Aller-Retour — même bus</option>
          <option value="AR2">Aller-Retour — 2 bus différents</option>
          <option value="__none__">— Sans trajet —</option>
        </Select>
        <Select value={busFilter} onChange={(e) => setBusFilter(e.target.value)}>
          <option value="">Tous les bus</option>
          <option value="__none__">— Sans bus —</option>
          {buses.map((c) => (
            <option key={c} value={c}>Bus {c}</option>
          ))}
        </Select>
        <Select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
          <option value="">Tous les quartiers</option>
          <option value="__none__">— Sans quartier —</option>
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </Select>
        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {levels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </Select>
      </div>

      {/* Count + actions */}
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
          <button
            type="button"
            onClick={save}
            disabled={pending || dirtyIds.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-3 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            Enregistrer{dirtyIds.length ? ` (${dirtyIds.length})` : ""}
          </button>
        </div>
      </div>

      <datalist id="bus-zones">
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>

      {/* Table — AS (aller) and RS (retour) are independent: own bus, own zone.
          Bounded height + sticky header keep BOTH scrollbars in view. */}
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-[color:var(--color-border-subtle)]">
        <table className="w-full min-w-[1640px] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-8 [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)]">
              <th className="px-3" colSpan={2} />
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 text-start font-semibold" colSpan={4}>
                <span className="inline-flex items-center gap-1"><Sunrise className="size-3.5" aria-hidden /> AS — Aller (matin)</span>
              </th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 text-start font-semibold" colSpan={4}>
                <span className="inline-flex items-center gap-1"><Sunset className="size-3.5" aria-hidden /> RS — Retour (soir)</span>
              </th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 text-start font-semibold" colSpan={3}>
                Facturation
              </th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3" />
            </tr>
            <tr className="text-start text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)] [&>th]:sticky [&>th]:top-8 [&>th]:z-10 [&>th]:border-b [&>th]:border-[color:var(--color-border-subtle)] [&>th]:bg-[color:var(--color-surface-raised)]">
              <SortTh label="Élève" k="name" />
              <SortTh label="Classe" k="classe" />
              <SortTh label="AS" k="as" className="border-s border-[color:var(--color-border-subtle)]" />
              <SortTh label="Bus N°" k="bus_matin" />
              <SortTh label="Quartier" k="zone_matin" />
              <th className="px-3 py-2 text-start font-semibold">Station</th>
              <SortTh label="RS" k="rs" className="border-s border-[color:var(--color-border-subtle)]" />
              <SortTh label="Bus N°" k="bus_soir" />
              <SortTh label="Quartier" k="zone_soir" />
              <th className="px-3 py-2 text-start font-semibold">Station</th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 py-2 text-start font-semibold">Tel</th>
              <th className="px-3 py-2 text-start font-semibold">Montant</th>
              <th className="px-3 py-2 text-start font-semibold">Payé</th>
              <th className="border-s border-[color:var(--color-border-subtle)] px-3 py-2 text-start font-semibold">Remarques</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const dirty = dirtyIds.includes(r.id);
              const e = e0(r.id);
              const as = e.bus_as === "yes";
              const rs = e.bus_rs === "yes";
              return (
                <tr
                  key={r.id}
                  className={
                    "border-b border-[color:var(--color-border-subtle)] last:border-0 " +
                    (dirty ? "bg-[color:var(--color-brand-500)]/5" : "")
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
                  <td className="w-12 border-s border-[color:var(--color-border-subtle)] px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={as}
                      aria-label="Aller (AS)"
                      onChange={(ev) => set(r.id, "bus_as", ev.target.checked ? "yes" : "")}
                      className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                    />
                  </td>
                  <td className="w-20 px-2 py-1.5">
                    {as ? (
                      <Input value={e.bus_car_matin} placeholder="—" onChange={(ev) => set(r.id, "bus_car_matin", ev.target.value)} className="h-8" />
                    ) : null}
                  </td>
                  <td className="w-36 px-2 py-1.5">
                    {as ? (
                      <Input value={e.bus_zone_matin} placeholder="Quartier" list="bus-zones" onChange={(ev) => set(r.id, "bus_zone_matin", ev.target.value)} className="h-8" />
                    ) : null}
                  </td>
                  <td className="w-40 px-2 py-1.5">
                    {as ? (
                      <Input value={e.bus_station_matin} placeholder="Station" onChange={(ev) => set(r.id, "bus_station_matin", ev.target.value)} className="h-8" />
                    ) : null}
                  </td>
                  <td className="w-12 border-s border-[color:var(--color-border-subtle)] px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={rs}
                      aria-label="Retour (RS)"
                      onChange={(ev) => set(r.id, "bus_rs", ev.target.checked ? "yes" : "")}
                      className="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-brand-600)]"
                    />
                  </td>
                  <td className="w-20 px-2 py-1.5">
                    {rs ? (
                      <Input value={e.bus_car_soir} placeholder="—" onChange={(ev) => set(r.id, "bus_car_soir", ev.target.value)} className="h-8" />
                    ) : null}
                  </td>
                  <td className="w-36 px-2 py-1.5">
                    {rs ? (
                      <Input value={e.bus_zone_soir} placeholder="Quartier" list="bus-zones" onChange={(ev) => set(r.id, "bus_zone_soir", ev.target.value)} className="h-8" />
                    ) : null}
                  </td>
                  <td className="w-40 px-2 py-1.5">
                    {rs ? (
                      <Input value={e.bus_station_soir} placeholder="Station" onChange={(ev) => set(r.id, "bus_station_soir", ev.target.value)} className="h-8" />
                    ) : null}
                  </td>
                  <td className="w-36 whitespace-nowrap border-s border-[color:var(--color-border-subtle)] px-3 py-1.5 text-xs text-[color:var(--color-foreground-muted)]">
                    {r.bus_tel || "—"}
                  </td>
                  <td className="w-20 px-3 py-1.5 text-end tabular-nums text-[color:var(--color-foreground-muted)]">
                    {r.bus_montant || "—"}
                  </td>
                  <td
                    className={
                      "w-20 px-3 py-1.5 text-end tabular-nums " +
                      (r.bus_montant &&
                      Number(r.bus_paye || 0) < Number(r.bus_montant || 0)
                        ? "font-semibold text-red-600 dark:text-red-400"
                        : "text-[color:var(--color-foreground-muted)]")
                    }
                  >
                    {r.bus_paye || "—"}
                  </td>
                  <td className="w-40 border-s border-[color:var(--color-border-subtle)] px-2 py-1.5">
                    <Input value={e.bus_remarques} placeholder="—" onChange={(ev) => set(r.id, "bus_remarques", ev.target.value)} className="h-8" />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
                  Aucun élève ne correspond.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pager — same look as the students / parents tables (50 per page).
          Bulk-save still covers dirty rows on every page. */}
      {filtered.length > 0 ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <PageBtn
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              label="Précédent"
            />
            <span className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
              Page {safePage} / {pageCount}
            </span>
            <PageBtn
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              label="Suivant"
            />
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
