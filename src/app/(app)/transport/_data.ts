import { db } from "@/lib/db";
import type { BusRow } from "./_manager";

/**
 * Transport data is PER PERIOD (academic year + trimester) — assignments
 * change every trimester. Stored in customAnswers.bus_periods as JSON:
 *   { "<yearLabel>|T1|T2|T3": { as, rs, car_matin, zone_matin, station_matin,
 *     car_soir, zone_soir, station_soir, remarques, tel, montant, paye } }
 * Legacy flat bus_* keys (pre-period model) act as a fallback for the active
 * year's T3 until an import / save migrates them.
 */

export const TRIMESTERS = ["T1", "T2", "T3"] as const;
export type Trimester = (typeof TRIMESTERS)[number];
export const DEFAULT_TRIM: Trimester = "T3";

export type BusPeriod = Partial<{
  as: string;
  rs: string;
  car_matin: string;
  zone_matin: string;
  station_matin: string;
  car_soir: string;
  zone_soir: string;
  station_soir: string;
  remarques: string;
  tel: string;
  montant: string;
  paye: string;
}>;

export function periodKey(yearLabel: string, trim: string): string {
  return `${yearLabel}|${trim}`;
}

export function parsePeriods(ca: Record<string, unknown>): Record<string, BusPeriod> {
  if (typeof ca.bus_periods !== "string") return {};
  try {
    const v = JSON.parse(ca.bus_periods);
    return v && typeof v === "object" ? (v as Record<string, BusPeriod>) : {};
  } catch {
    return {};
  }
}

/** Legacy flat keys → a BusPeriod (the pre-period model, = active year T3). */
export function legacyPeriod(ca: Record<string, unknown>): BusPeriod | null {
  if (!("bus_as" in ca) && !("bus_rs" in ca) && !("bus_car_matin" in ca)) return null;
  const s = (k: string) => String(ca[k] ?? "");
  return {
    as: s("bus_as") === "yes" ? "yes" : "",
    rs: s("bus_rs") === "yes" ? "yes" : "",
    car_matin: s("bus_car_matin"),
    zone_matin: s("bus_zone_matin"),
    station_matin: s("bus_station_matin"),
    car_soir: s("bus_car_soir"),
    zone_soir: s("bus_zone_soir"),
    station_soir: s("bus_station_soir"),
    remarques: s("bus_remarques"),
    tel: s("bus_tel"),
    montant: s("bus_montant"),
    paye: s("bus_paye"),
  };
}

export async function loadBusRows(opts?: {
  yearId?: string;
  trim?: string;
}): Promise<{
  rows: BusRow[];
  yearLabel: string;
  trim: Trimester;
  period: string;
  years: Array<{ id: string; label: string; isActive: boolean }>;
  selectedYearId: string;
}> {
  const years = await db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, label: true, isActive: true },
  });
  const activeYear = years.find((y) => y.isActive) ?? years[0];
  const selectedYearId =
    opts?.yearId && years.some((y) => y.id === opts.yearId)
      ? opts.yearId
      : (activeYear?.id ?? "");
  const selected = years.find((y) => y.id === selectedYearId);
  const label = selected?.label ?? "";
  const trim: Trimester = (TRIMESTERS as readonly string[]).includes(opts?.trim ?? "")
    ? (opts!.trim as Trimester)
    : DEFAULT_TRIM;
  const period = periodKey(label, trim);
  // Legacy flat keys correspond to the active year's T3 (the pre-period state).
  const legacyApplies = !!selected?.isActive && trim === "T3";

  const students = await db.student.findMany({
    where: { enrollments: { some: { academicYearId: selectedYearId } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      family: { select: { code: true } },
      enrollments: {
        where: { academicYearId: selectedYearId },
        select: { class: { select: { name: true, level: true } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows: BusRow[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let registered = false;
    try {
      const sby = JSON.parse(String(ca.services_by_year ?? "{}")) as Record<string, string>;
      if (String(sby[label] ?? "").includes("Transport")) registered = true;
    } catch {
      /* ignore */
    }
    if (!registered) {
      try {
        const reg = JSON.parse(String(ca.registration_by_year ?? "{}")) as Record<
          string,
          Record<string, string>
        >;
        if (reg[label]?.autocar === "yes") registered = true;
      } catch {
        /* ignore */
      }
    }
    const periods = parsePeriods(ca);
    const p: BusPeriod =
      periods[period] ?? (legacyApplies ? (legacyPeriod(ca) ?? {}) : {});
    // A student with an assignment this period belongs on the page even if the
    // service-registration detection (billing/autocar) missed them.
    if (!registered && p.as !== "yes" && p.rs !== "yes") continue;
    // Old single-zone seed (from BusDetails) = default quartier suggestion.
    const legacyZone = String(ca.bus_zone ?? "");
    const as = p.as === "yes";
    const rs = p.rs === "yes";
    rows.push({
      id: s.id,
      name: `${s.lastName} ${s.firstName}`,
      family: s.family?.code ?? "",
      className: s.enrollments[0]?.class.name ?? "",
      level: s.enrollments[0]?.class.level ?? "",
      bus_as: as ? "yes" : "",
      bus_rs: rs ? "yes" : "",
      bus_car_matin: p.car_matin ?? "",
      bus_zone_matin: (p.zone_matin ?? "") || (as ? legacyZone : ""),
      bus_station_matin: p.station_matin ?? "",
      bus_car_soir: p.car_soir ?? "",
      bus_zone_soir: (p.zone_soir ?? "") || (rs ? legacyZone : ""),
      bus_station_soir: p.station_soir ?? "",
      bus_remarques: p.remarques ?? "",
      bus_tel: p.tel ?? "",
      bus_montant: p.montant ?? "",
      bus_paye: p.paye ?? "",
    });
  }
  return {
    rows,
    yearLabel: label,
    trim,
    period,
    years,
    selectedYearId,
  };
}

/** Column set shared by the Excel export and the print view. */
export const BUS_EXPORT_COLUMNS = [
  { key: "name", header: "Élève", width: 28 },
  { key: "family", header: "Code famille", width: 12 },
  { key: "className", header: "Classe", width: 10 },
  { key: "as", header: "AS", width: 6 },
  { key: "bus_car_matin", header: "Bus matin", width: 10 },
  { key: "bus_zone_matin", header: "Quartier matin", width: 18 },
  { key: "bus_station_matin", header: "Station matin", width: 24 },
  { key: "rs", header: "RS", width: 6 },
  { key: "bus_car_soir", header: "Bus soir", width: 10 },
  { key: "bus_zone_soir", header: "Quartier soir", width: 18 },
  { key: "bus_station_soir", header: "Station soir", width: 24 },
  { key: "bus_tel", header: "Tel", width: 20 },
  { key: "bus_montant", header: "Montant", width: 10 },
  { key: "bus_paye", header: "Payé", width: 10 },
  { key: "bus_remarques", header: "Remarques", width: 24 },
] as const;

const busNum = (v: string) => {
  const n = Number(v.trim());
  return v.trim() === "" ? Number.POSITIVE_INFINITY : Number.isFinite(n) ? n : 9e8;
};

/** Rows → export records, sorted by bus matin → quartier → name. */
export function toExportRows(rows: BusRow[]): Array<Record<string, string>> {
  return [...rows]
    .sort((a, b) => {
      const bm = busNum(a.bus_car_matin) - busNum(b.bus_car_matin);
      if (bm !== 0) return bm;
      const z = (a.bus_zone_matin || a.bus_zone_soir).localeCompare(b.bus_zone_matin || b.bus_zone_soir);
      if (z !== 0) return z;
      return a.name.localeCompare(b.name);
    })
    .map((r) => ({
      name: r.name,
      family: r.family,
      className: r.className,
      as: r.bus_as === "yes" ? "AS" : "",
      bus_car_matin: r.bus_car_matin,
      bus_zone_matin: r.bus_zone_matin,
      bus_station_matin: r.bus_station_matin,
      rs: r.bus_rs === "yes" ? "RS" : "",
      bus_car_soir: r.bus_car_soir,
      bus_zone_soir: r.bus_zone_soir,
      bus_station_soir: r.bus_station_soir,
      bus_tel: r.bus_tel,
      bus_montant: r.bus_montant,
      bus_paye: r.bus_paye,
      bus_remarques: r.bus_remarques,
    }));
}
