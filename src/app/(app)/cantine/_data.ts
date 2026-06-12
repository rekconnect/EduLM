import { db } from "@/lib/db";
import type { ServiceRow } from "./_list";

// Collation is only offered up to CM2 — mirrors the fiche rule.
const COLLATION_LEVELS = new Set([
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
]);

/**
 * Shared loader for the Cantine / Collation module: every active-year student
 * registered for the canteen and/or snack per the accounting-synced
 * services_by_year. Used by the page, the Excel export route and the print
 * view. Must run inside a tenant session/context.
 */
export async function loadCantineRows(): Promise<{
  rows: ServiceRow[];
  yearLabel: string;
  /** Enrolled students missing at least one service — the "Inscrire" picker. */
  candidates: Array<{
    id: string;
    name: string;
    className: string;
    level: string;
    hasCantine: boolean;
    hasCollation: boolean;
  }>;
}> {
  const activeYear = await db.academicYear.findFirst({
    where: { isActive: true },
    select: { label: true },
  });
  const label = activeYear?.label ?? "";

  const students = await db.student.findMany({
    where: { enrollments: { some: { academicYear: { isActive: true } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      family: { select: { code: true } },
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { class: { select: { name: true, level: true } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows: ServiceRow[] = [];
  const candidates: Array<{
    id: string;
    name: string;
    className: string;
    level: string;
    hasCantine: boolean;
    hasCollation: boolean;
  }> = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let services = "";
    try {
      const sby = JSON.parse(String(ca.services_by_year ?? "{}")) as Record<string, string>;
      services = sby[label] ?? "";
    } catch {
      /* ignore */
    }
    const level = s.enrollments[0]?.class.level ?? "";
    const collation = COLLATION_LEVELS.has(level) && services.includes("Collation");
    const cantine = services.includes("Cantine");
    const collationPossible = COLLATION_LEVELS.has(level);
    if (!cantine || (collationPossible && !collation)) {
      candidates.push({
        id: s.id,
        name: `${s.lastName} ${s.firstName}`,
        className: s.enrollments[0]?.class.name ?? "",
        level,
        hasCantine: cantine,
        hasCollation: collation,
      });
    }
    if (!collation && !cantine) continue;
    rows.push({
      id: s.id,
      name: `${s.lastName} ${s.firstName}`,
      family: s.family?.code ?? "",
      className: s.enrollments[0]?.class.name ?? "",
      level,
      collation,
      cantine,
    });
  }
  return { rows, yearLabel: label, candidates };
}

export const CANTINE_EXPORT_COLUMNS = [
  { key: "name", header: "Élève", width: 28 },
  { key: "family", header: "Code famille", width: 12 },
  { key: "className", header: "Classe", width: 10 },
  { key: "collation", header: "Collation", width: 10 },
  { key: "cantine", header: "Cantine", width: 10 },
] as const;

const LEVEL_ORDER = [
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale",
];
const lvlIdx = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i < 0 ? 99 : i;
};

/** Rows → export records, sorted by level → name. */
export function toExportRows(rows: ServiceRow[]): Array<Record<string, string>> {
  return [...rows]
    .sort((a, b) => {
      const li = lvlIdx(a.level) - lvlIdx(b.level);
      if (li !== 0) return li;
      return a.name.localeCompare(b.name);
    })
    .map((r) => ({
      name: r.name,
      family: r.family,
      className: r.className,
      collation: r.collation ? "Oui" : "",
      cantine: r.cantine ? "Oui" : "",
    }));
}
