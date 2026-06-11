/**
 * Read-only: does the gap between the tarif file (460 él., $148,680 brut) and
 * the Dars dashboard (507, $162,705 brut / $155,960 net) correspond to the 58
 * EduLM-assigned students absent from the file (activity returns)?
 * Sums their stored montants and counts their directions.
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
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
    const o = v as { text?: string; richText?: Array<{ text: string }> };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
  }
  return v == null ? "" : String(v);
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // Codes in the tarif file.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  const codes = new Set<string>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const c = cellText(ws, r, 2).trim().toUpperCase();
    if (c) codes.add(c);
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: "2025-2026" } } } },
    select: { firstName: true, lastName: true, customAnswers: true },
  });

  let absCount = 0;
  let absMontant = 0;
  let absAs = 0;
  let absRs = 0;
  let absNoMontant = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const code = String(ca.dars_student_code ?? "").trim().toUpperCase();
    if (code && codes.has(code)) continue;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch {
      /* ignore */
    }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    absCount++;
    if (p.as === "yes") absAs++;
    if (p.rs === "yes") absRs++;
    const m = Number(p.montant) || 0;
    if (m === 0) absNoMontant++;
    absMontant += m;
  }
  console.log(`Affectés EduLM ABSENTS du fichier tarif: ${absCount}`);
  console.log(`  dont aller (AS): ${absAs} · retour (RS): ${absRs} · sans montant connu: ${absNoMontant}`);
  console.log(`  somme de leurs montants (anciens manifestes): $${absMontant.toLocaleString("en-US")}`);
  console.log(`\nÉcarts dashboard vs fichier: élèves 507-460=47 · brut $162,705-$148,680=$14,025`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
