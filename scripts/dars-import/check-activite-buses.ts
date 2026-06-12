/**
 * Read-only: for every student with garderie/activity DAYS in the BUS MAJ
 * workbook, list ALL their rows (tab, college?, legs, bus) and compare with
 * the stored car_soir — find the wrong "retour collège" buses.
 *   --file="C:\Users\raede\Code\EduLM\tmp-bus-maj.xlsx"
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
    const o = v as { text?: string; richText?: Array<{ text: string }>; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
  }
  return v == null ? "" : String(v);
};
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const looksLikeLevel = (s: string) =>
  /^(ps|ms|gs|cp|ce|cm|6|5|4|3|2nde|2 nde|1ere|1 ere|term|tle)/i.test(deburr(s).trim());
const rawKey = (s: string) => deburr(s).toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const { tenantName } = parseFlags();
  await resolveTenant(prisma, tenantName);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  type R = { name: string; tab: string; college: boolean; legs: string; days: string; bus: string };
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
      rows.push({ name, tab: ws.name.trim(), college: !!m[2], legs: legsRaw, days, bus: m[1]! });
    }
  }

  // Students that have at least one days-row.
  const withDays = new Set(rows.filter((r) => r.days).map((r) => rawKey(r.name)));
  console.log(`Élèves avec lignes "jours" (activités/garderie): ${withDays.size}\n`);
  for (const key of [...withDays].sort()) {
    const mine = rows.filter((r) => rawKey(r.name) === key);
    console.log(`• ${mine[0]!.name}`);
    for (const r of mine) {
      console.log(`    [${r.tab}]${r.college ? " (College)" : ""} trajet="${r.legs}"${r.days ? "  ← jours" : ""}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
