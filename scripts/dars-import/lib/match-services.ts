/**
 * Shared name-matching for the accounting Cantine / Collation Excel lists.
 * Used by both the read-only validator (check-services-excel) and the importer
 * (sync-services-from-excel) so the matching logic can never diverge.
 *
 * The exports identify students only by name (+ class / father), because the
 * accounting export carries no code/ID:
 *   Nom | Prénom (×3) | Père (father first name) | Classe (e.g. "CE2/B")
 * EduLM stores some surnames with a particle ("Khoury (El)") absent from the
 * export ("Khoury"), so particles are stripped on both sides; the surname may
 * also be a subset of the export's Nom cell ("Saade" ⊆ "Jonas Saade").
 */
import ExcelJS from "exceljs";

export type ServiceRow = {
  nom: string;
  prenom: string;
  pere: string;
  classe: string;
};
export type MatchStudent = {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  level: string;
  fatherName: string;
};

const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
// Particles present in EduLM ("Khoury (El)", "Gemayel (Al)") but dropped in the
// accounting export. Removed from both sides before comparing.
const PARTICLES = new Set(["el", "al", "le", "la", "les"]);
export const coreTokens = (s: string): string[] =>
  deburr(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !PARTICLES.has(t));
export const normFirst = (s: string): string =>
  deburr((s || "").split(/[,/]/)[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
export const normClass = (s: string): string =>
  deburr(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Read an accounting list sheet → rows (skips the title + header rows 1–5). */
export async function readServiceList(path: string): Promise<ServiceRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const cell = (r: ExcelJS.Row, c: number): string => {
    const v = r.getCell(c).value as unknown;
    if (v && typeof v === "object") {
      const o = v as { text?: string; richText?: Array<{ text: string }> };
      if (o.richText) return o.richText.map((t) => t.text).join("");
      if (o.text != null) return o.text;
    }
    return v == null ? "" : String(v);
  };
  const rows: ServiceRow[] = [];
  ws.eachRow((r, n) => {
    if (n <= 5) return;
    const nom = cell(r, 1).trim();
    const prenom = cell(r, 2).trim();
    const pere = cell(r, 5).trim();
    const classe = cell(r, 6).trim();
    if (!nom && !prenom) return;
    rows.push({ nom, prenom, pere, classe });
  });
  return rows;
}

type Prepared = {
  st: MatchStudent;
  last: Set<string>;
  first: string;
  cls: string;
  pere: string;
};
export function prepare(students: MatchStudent[]): Prepared[] {
  return students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName)),
    first: normFirst(st.firstName),
    cls: normClass(st.className),
    pere: normFirst(st.fatherName),
  }));
}

/** Best student for one row, or null. `ambiguous` when ≥2 tie for top score. */
export function matchRow(
  prepared: Prepared[],
  row: ServiceRow,
): { st: MatchStudent; ambiguous: boolean } | null {
  const exLast = new Set(coreTokens(row.nom));
  const exFirst = normFirst(row.prenom);
  const exClass = normClass(row.classe);
  const exPere = normFirst(row.pere);
  if (exLast.size === 0 || exFirst === "") return null;

  let best: Prepared | null = null;
  let bestScore = -1;
  let tie = false;
  for (const p of prepared) {
    if (p.last.size === 0) continue;
    const inter = [...p.last].filter((t) => exLast.has(t)).length;
    // surname compatible: one side's tokens fully contained in the other's.
    const lastOk = inter > 0 && (inter === p.last.size || inter === exLast.size);
    if (!lastOk) continue;
    const firstOk =
      p.first === exFirst ||
      p.first.startsWith(exFirst) ||
      exFirst.startsWith(p.first);
    if (!firstOk) continue;
    const classOk = p.cls !== "" && p.cls === exClass;
    const pereOk = exPere !== "" && p.pere === exPere;
    const exact = p.first === exFirst;
    const score =
      inter * 2 + (classOk ? 4 : 0) + (pereOk ? 2 : 0) + (exact ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
      tie = false;
    } else if (score === bestScore && best && p.st.id !== best.st.id) {
      tie = true;
    }
  }
  if (!best) return null;
  return { st: best.st, ambiguous: tie };
}

/** Match a whole list → matched id set + unmatched rows (with a reason). */
export function matchList(
  prepared: Prepared[],
  rows: ServiceRow[],
): { onList: Set<string>; unmatched: Array<ServiceRow & { why: string }> } {
  const onList = new Set<string>();
  const unmatched: Array<ServiceRow & { why: string }> = [];
  for (const row of rows) {
    const m = matchRow(prepared, row);
    if (m && !m.ambiguous) onList.add(m.st.id);
    else unmatched.push({ ...row, why: m?.ambiguous ? "ambigu" : "introuvable" });
  }
  return { onList, unmatched };
}
