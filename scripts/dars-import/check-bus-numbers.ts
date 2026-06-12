/**
 * Read-only: compare bus numbers EduLM ↔ tarif file ↔ Dars stations, per
 * direction, for EVERY student. Find systematic bus-number mistakes
 * (user spotted: Bou Akl Sasha should be AS bus 3 / RS bus 19).
 *   --file="C:\Users\raede\Downloads\rptTrsEleveActiviteTarif.xlsx"
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

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

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // ── File: per code, per direction → bus (col 14 car, col 15 type) ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  const file = new Map<string, { matin?: string; soir?: string; nom: string }>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = cellText(ws, r, 2).trim().toUpperCase();
    const nom = `${cellText(ws, r, 4).trim()} ${cellText(ws, r, 5).trim()}`;
    if (!code) continue;
    const car = cellText(ws, r, 14).trim();
    const type = cellText(ws, r, 15).trim().toUpperCase();
    const e = file.get(code) ?? { nom };
    if (type === "AS" || type === "AR") e.matin = car;
    if (type === "RS" || type === "AR") e.soir = car;
    file.set(code, e);
  }
  console.log(`Fichier tarif: ${file.size} élèves`);

  // ── Dars stations: per darsId, per direction → circuit numbers ──
  const st = await darsQuery<{ Id_Eleve: number; Type_Trajet: string; Numero: number }>(
    `SELECT es.Id_Eleve, es.Type_Trajet, c.Numero
     FROM Trs_Eleve_Station es
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=2026
     WHERE es.Id_College=${C} AND es.Flag_Desistement=0`,
  );
  const dars = new Map<number, { matin: Set<string>; soir: Set<string> }>();
  for (const r of st) {
    const e = dars.get(r.Id_Eleve) ?? { matin: new Set<string>(), soir: new Set<string>() };
    if (r.Type_Trajet === "AS" || r.Type_Trajet === "AR") e.matin.add(String(r.Numero));
    if (r.Type_Trajet === "RS" || r.Type_Trajet === "AR") e.soir.add(String(r.Numero));
    dars.set(r.Id_Eleve, e);
  }

  // ── EduLM ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  let checked = 0;
  const fileMismatch: string[] = [];
  const darsMismatch: string[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { continue; }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    checked++;
    const code = String(ca.dars_student_code ?? "").trim().toUpperCase();
    const f = code ? file.get(code) : undefined;
    const d = dars.get(Number(s.darsStudentId));
    const name = `${s.lastName} ${s.firstName}`;
    for (const dir of ["matin", "soir"] as const) {
      const on = dir === "matin" ? p.as === "yes" : p.rs === "yes";
      if (!on) continue;
      const stored = (p[`car_${dir}`] ?? "").trim();
      const fv = f?.[dir]?.trim();
      if (fv != null && fv !== "" && stored !== fv) {
        fileMismatch.push(`${name} — ${dir}: EduLM "${stored}" ≠ fichier "${fv}"`);
      }
      const dv = d?.[dir];
      if (dv && dv.size > 0 && stored && !dv.has(stored)) {
        darsMismatch.push(`${name} — ${dir}: EduLM "${stored}" ∉ Dars {${[...dv].join(",")}}`);
      }
    }
  }
  console.log(`EduLM vérifiés: ${checked}`);
  console.log(`\n— Écarts vs FICHIER tarif (${fileMismatch.length}) —`);
  for (const m of fileMismatch) console.log(`  ! ${m}`);
  console.log(`\n— Écarts vs circuits DARS (${darsMismatch.length}) —`);
  for (const m of darsMismatch) console.log(`  ! ${m}`);

  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
