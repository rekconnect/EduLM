/**
 * Read-only: for the 44 workbook activity students — workbook normal-soir bus
 * vs activity (College) bus vs EduLM stored car_soir vs Dars RS circuit.
 *   --file="C:\Users\raede\Code\EduLM\tmp-bus-maj.xlsx"
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
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
  t.replace(/y/g, "i").replace(/sh/g, "ch").replace(/ph/g, "f").replace(/th/g, "t").replace(/eh$/g, "e").replace(/(.)\1+/g, "$1");
const looksLikeLevel = (s: string) =>
  /^(ps|ms|gs|cp|ce|cm|6|5|4|3|2nde|2 nde|1ere|1 ere|term|tle)/i.test(deburr(s).trim());
const rawKey = (s: string) => deburr(s).toLowerCase().replace(/\s+/g, " ").trim();

const ALIASES: Record<string, { first: string; last: string }> = {
  "cecilia yaziji": { first: "Cécilia", last: "Yazegi" },
  "khoury (el) axelle": { first: "Axelle", last: "Khoury" },
  "abi hayla adrianna": { first: "Adriana", last: "Abi Haila" },
  "abdel sater sky, maria, christina": { first: "Sky", last: "Abdel Sater" },
  "fidawi kiyana": { first: "Kiana", last: "Fidawi" },
  "tager yacha": { first: "Yasha", last: "Tager" },
  "tager yoana": { first: "Yoanna", last: "Tager" },
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  type R = { name: string; college: boolean; legs: string; days: string; bus: string };
  const rows: R[] = [];
  for (const ws of wb.worksheets) {
    const m = /^Bus\s*(\d+)\s*(College)?/i.exec(ws.name.trim());
    if (!m) continue;
    for (let r = 3; r <= ws.rowCount; r++) {
      let name = cellText(ws, r, 1).trim();
      let classe = cellText(ws, r, 2).trim();
      const legsRaw = cellText(ws, r, 4).trim();
      if (!name || /^\d+$/.test(name) || /^total/i.test(name) || /^\[object/.test(name)) continue;
      if (/prof/i.test(classe)) continue;
      if (!legsRaw || /^total/i.test(legsRaw)) continue;
      const legs = deburr(legsRaw).toLowerCase();
      const days = /lundi|mardi|mercredi|jeudi|vendredi/.test(legs) ? legsRaw : "";
      if (days && classe && !looksLikeLevel(classe)) name = `${name} ${classe}`;
      rows.push({ name, college: !!m[2], legs: legsRaw, days, bus: m[1]! });
    }
  }
  const byName = new Map<string, R[]>();
  for (const r of rows) {
    const k = rawKey(r.name);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: "2025-2026" } } } },
    select: { id: true, firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
  });
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName).map(squash)),
    first: squash(normFirst(st.firstName)),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
  function match(name: string) {
    const alias = ALIASES[rawKey(name)];
    if (alias) {
      const lastT = new Set(coreTokens(alias.last).map(squash));
      const fn = squash(normFirst(alias.first));
      return prepared.find((p) => [...p.last].every((t) => lastT.has(t)) && firstOk(p.first, fn))?.st ?? null;
    }
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
      const score = inter * 2;
      if (score > bestScore) {
        bestScore = score;
        best = p;
        tie = false;
      } else if (score === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  // Dars RS circuits per student.
  const dars = await darsQuery<{ Id_Eleve: number; Numero: number }>(
    `SELECT DISTINCT es.Id_Eleve, c.Numero
     FROM Trs_Eleve_Station es
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=2026
     WHERE es.Id_College=${C} AND es.Flag_Desistement=0 AND es.Type_Trajet IN ('RS','AR')`,
  );
  const darsRs = new Map<number, string[]>();
  for (const d of dars) {
    darsRs.set(d.Id_Eleve, [...(darsRs.get(d.Id_Eleve) ?? []), String(d.Numero)]);
  }

  console.log("Élève | soir normal (classeur) | bus activité (College) | car_soir EduLM | RS Dars");
  for (const [key, mine] of [...byName.entries()].sort()) {
    if (!mine.some((r) => r.days)) continue;
    const normalSoir = mine.filter((r) => !r.days && /soir|m\s*\/\s*s|;/i.test(deburr(r.legs).toLowerCase()) && /soir/i.test(deburr(r.legs).toLowerCase()));
    const actRows = mine.filter((r) => r.days);
    const stTarget = match(mine[0]!.name);
    let stored = "?";
    let darsBus = "?";
    if (stTarget) {
      const ca = (stTarget.customAnswers ?? {}) as Record<string, unknown>;
      try {
        const p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
        stored = p ? `${p.car_soir || "—"}${p.rs === "yes" ? "" : " (rs OFF)"}` : "(aucune)";
      } catch { stored = "(err)"; }
      darsBus = (darsRs.get(Number(stTarget.darsStudentId)) ?? ["—"]).join("/");
    } else {
      stored = "(non apparié)";
    }
    console.log(
      `${mine[0]!.name} | ${normalSoir.map((r) => r.bus).join("/") || "—"} | ${actRows.map((r) => `${r.bus} (${r.days})`).join(" + ")} | ${stored} | ${darsBus}`,
    );
  }
  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
