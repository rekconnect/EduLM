/**
 * Read-only reconciliation: pair the "absent from Excel" EduLM students with
 * the "not found in EduLM" Excel rows using fuzzy similarity (character
 * bigrams on spelling-normalized names + level hint). Output: proposed pairs
 * (Excel spelling ↔ EduLM spelling) for human validation + true leftovers.
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { coreTokens, normFirst } from "./lib/match-services.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";
const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};
const cellText = (ws: ExcelJS.Worksheet, r: number, c: number): string => {
  const v = ws.getRow(r).getCell(c).value as unknown;
  if (v && typeof v === "object") {
    const o = v as { text?: string; richText?: Array<{ text: string }>; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
  }
  return v == null ? "" : String(v);
};
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const squash = (t: string) =>
  t.replace(/(.)\1+/g, "$1").replace(/y/g, "i").replace(/sh/g, "ch").replace(/eh$/g, "e");
const canon = (s: string) =>
  squash(deburr(s).toLowerCase().replace(/[^a-z]/g, ""));
const bigrams = (s: string) => {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
};
const dice = (a: string, b: string) => {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const file = arg("file");

  // Parse Excel rows (same rules as the analysis).
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  type XRow = { name: string; classe: string; bus: string; legs: string };
  const xrows: XRow[] = [];
  for (const ws of wb.worksheets) {
    const m = /^Bus\s*(\d+)\s*(College)?/i.exec(ws.name.trim());
    if (!m) continue;
    for (let r = 3; r <= ws.rowCount; r++) {
      const name = cellText(ws, r, 1).trim();
      const classe = cellText(ws, r, 2).trim();
      const legsRaw = cellText(ws, r, 4).trim();
      if (!name || /^\d+$/.test(name) || /^total/i.test(name) || /prof/i.test(classe)) continue;
      if (!legsRaw || /^total/i.test(legsRaw)) continue;
      xrows.push({ name, classe, bus: m[1]!, legs: legsRaw });
    }
  }

  // EduLM students + matcher (same as analysis).
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: "2025-2026" } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        where: { academicYear: { label: "2025-2026" } },
        select: { class: { select: { level: true } } },
        take: 1,
      },
    },
  });
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName).map(squash)),
    first: squash(normFirst(st.firstName)),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
  function match(name: string) {
    const tokens = new Set(coreTokens(name).map(squash));
    let best: (typeof prepared)[number] | null = null;
    let tie = false;
    let bestScore = -1;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => tokens.has(t)).length;
      if (inter !== p.last.size) continue;
      const rest = [...tokens].filter((t) => !p.last.has(t));
      if (!rest.some((t) => firstOk(p.first, t))) continue;
      if (inter > bestScore) {
        bestScore = inter;
        best = p;
        tie = false;
      } else if (inter === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  const matchedIds = new Set<string>();
  const unmatchedRows: XRow[] = [];
  for (const r of xrows) {
    const t = match(r.name);
    if (t) matchedIds.add(t.id);
    else unmatchedRows.push(r);
  }

  // Absents: EduLM students with a T3 assignment not matched by any Excel row.
  type Absent = { id: string; label: string; canon: string; level: string };
  const absents: Absent[] = [];
  for (const s of students) {
    if (matchedIds.has(s.id)) continue;
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    try {
      const periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
      const p = periods[PERIOD];
      if (p && (p.as === "yes" || p.rs === "yes"))
        absents.push({
          id: s.id,
          label: `${s.lastName} ${s.firstName} [${p.as === "yes" ? "AS " + (p.car_matin || "?") : ""}${p.as === "yes" && p.rs === "yes" ? " + " : ""}${p.rs === "yes" ? "RS " + (p.car_soir || "?") : ""}]`,
          canon: canon(`${s.firstName} ${s.lastName}`),
          level: s.enrollments[0]?.class.level ?? "",
        });
    } catch {
      /* ignore */
    }
  }

  // Pair by Dice similarity.
  const pairs: Array<{ score: number; excel: XRow; absent: Absent }> = [];
  const usedAbsent = new Set<string>();
  const usedRow = new Set<XRow>();
  const candidates: Array<{ score: number; excel: XRow; absent: Absent }> = [];
  for (const r of unmatchedRows)
    for (const a of absents)
      candidates.push({ score: dice(canon(r.name), a.canon), excel: r, absent: a });
  candidates.sort((x, y) => y.score - x.score);
  for (const c of candidates) {
    if (c.score < 0.55) break;
    if (usedAbsent.has(c.absent.id) || usedRow.has(c.excel)) continue;
    usedAbsent.add(c.absent.id);
    usedRow.add(c.excel);
    pairs.push(c);
  }

  console.log(`=== PAIRES PROBABLES (orthographe différente) — ${pairs.length} ===`);
  for (const p of pairs.sort((a, b) => b.score - a.score))
    console.log(
      `  ${(p.score * 100).toFixed(0)}%  Excel: "${p.excel.name}" (${p.excel.classe}, Bus ${p.excel.bus}, ${p.excel.legs.replace(/\n/g, " ")})  ↔  EduLM: ${p.absent.label}`,
    );

  console.log(`\n=== ABSENTS restants (vraiment pas dans l'Excel) — ${absents.length - pairs.length} ===`);
  for (const a of absents.filter((x) => !usedAbsent.has(x.id)))
    console.log(`  • ${a.label} (${a.level})`);

  console.log(`\n=== Lignes Excel restantes (vraiment pas dans EduLM) — ${unmatchedRows.filter((r) => !usedRow.has(r)).length} ===`);
  const seen = new Set<string>();
  for (const r of unmatchedRows.filter((r) => !usedRow.has(r))) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  • ${r.name} (${r.classe}, Bus ${r.bus}, ${r.legs.replace(/\n/g, " ")})`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
