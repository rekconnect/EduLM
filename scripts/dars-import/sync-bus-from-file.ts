/**
 * Re-sync bus assignment FIELDS (car / zoneno / zone / station per direction)
 * from the CURRENT rptTrsEleveActiviteTarif.xlsx — the file was re-exported
 * after the original import (e.g. Bou Akl Sasha is now AS bus 3 / RS bus 19).
 * DOES NOT touch montant/remise/net (kept from the Dars billing sync), nor
 * tel/remarques/act_* fields.
 *
 * Matching: dars_student_code, with a NAME GUARD — sibling rows sometimes
 * share a code (Jabbour), so a row only applies to the student whose name
 * shares ≥1 token with the row's nom+prénom.
 * Multi-row same direction: the row WITH a montant wins, else the last one.
 * Dry-run by default; --confirm to write.
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
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
const squash = (t: string) =>
  t.replace(/y/g, "i").replace(/sh/g, "ch").replace(/ph/g, "f").replace(/th/g, "t").replace(/eh$/g, "e").replace(/(.)\1+/g, "$1");
const tokens = (s: string) =>
  new Set(
    deburr(s).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter((t) => t && !["el", "al"].includes(t)).map(squash),
  );

type FRow = { nom: string; car: string; zoneno: string; quartier: string; station: string; type: string; montant: number };

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  const byCode = new Map<string, FRow[]>();
  const noCode: FRow[] = []; // rows without a student code → matched by name
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = cellText(ws, r, 2).trim().toUpperCase();
    const nom = `${cellText(ws, r, 4).trim()} ${cellText(ws, r, 5).trim()}`.trim();
    if (!nom) continue;
    const quartierStation = cellText(ws, r, 19).trim();
    const commaAt = quartierStation.indexOf(",");
    const row: FRow = {
      nom,
      car: cellText(ws, r, 14).trim(),
      zoneno: cellText(ws, r, 18).trim(),
      quartier: (commaAt >= 0 ? quartierStation.slice(0, commaAt) : quartierStation).trim(),
      station: commaAt >= 0 ? quartierStation.slice(commaAt + 1).replace(/\s+/g, " ").trim() : "",
      type: cellText(ws, r, 15).trim().toUpperCase(),
      montant: Number(cellText(ws, r, 22).trim()) || 0,
    };
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), row]);
    else noCode.push(row);
  }
  console.log(`Fichier: ${byCode.size} codes · ${noCode.length} lignes sans code (match par nom)`);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string[] }> = [];
  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    const code = String(ca.dars_student_code ?? "").trim().toUpperCase();
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;

    // Name guard against sibling code collisions; code-less rows match when
    // BOTH name tokens sets overlap fully one way (unique among students is
    // guaranteed by requiring all the row's tokens ⊆ student tokens or vice versa).
    const myTokens = tokens(`${s.lastName} ${s.firstName}`);
    const overlap = (r: FRow) => {
      const rt = tokens(r.nom);
      const inter = [...rt].filter((t) => myTokens.has(t)).length;
      return inter >= 2 && (inter === rt.size || inter === myTokens.size);
    };
    const rows = [
      ...(code && byCode.has(code)
        ? byCode.get(code)!.filter((r) => [...tokens(r.nom)].filter((t) => myTokens.has(t)).length >= 2)
        : []),
      ...noCode.filter(overlap),
    ];
    if (!rows.length) continue;

    const pick = (dir: "AS" | "RS"): FRow | undefined => {
      const cand = rows.filter((r) => r.type === dir || r.type === "AR");
      if (!cand.length) return undefined;
      return cand.find((r) => r.montant > 0) ?? cand[cand.length - 1];
    };
    const notes: string[] = [];
    for (const [dir, key] of [["AS", "matin"], ["RS", "soir"]] as const) {
      const on = key === "matin" ? p.as === "yes" : p.rs === "yes";
      const f = pick(dir);
      if (!on || !f) continue;
      const diffs: string[] = [];
      if (f.car && p[`car_${key}`] !== f.car) {
        diffs.push(`bus ${p[`car_${key}`] || "—"}→${f.car}`);
        p[`car_${key}`] = f.car;
      }
      if (f.zoneno && (p[`zoneno_${key}`] ?? "") !== f.zoneno) {
        diffs.push(`zone ${p[`zoneno_${key}`] || "—"}→${f.zoneno}`);
        p[`zoneno_${key}`] = f.zoneno;
      }
      // Never replace a real quartier with the file's "--" placeholder,
      // nor a station with a bare "Imm." leftover.
      if (f.quartier && f.quartier !== "--" && (p[`zone_${key}`] ?? "") !== f.quartier) {
        diffs.push(`quartier "${p[`zone_${key}`] || "—"}"→"${f.quartier}"`);
        p[`zone_${key}`] = f.quartier;
      }
      if (f.station && !/^imm\.?$/i.test(f.station) && (p[`station_${key}`] ?? "") !== f.station) {
        diffs.push(`station →"${f.station.slice(0, 40)}"`);
        p[`station_${key}`] = f.station;
      }
      if (diffs.length) notes.push(`${key}: ${diffs.join(" · ")}`);
    }
    if (notes.length) {
      periods[PERIOD] = p;
      ca.bus_periods = JSON.stringify(periods);
      updates.push({ id: s.id, ca, label: notes.map((n) => `${s.lastName} ${s.firstName} — ${n}`) });
    }
  }

  console.log(`\n${updates.length} élèves à mettre à jour:`);
  for (const u of updates) for (const l of u.label) console.log(`  ~ ${l}`);

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    for (const u of updates) {
      await prisma.student.update({
        where: { id: u.id },
        data: { customAnswers: u.ca as Prisma.InputJsonValue },
      });
    }
    console.log(`\n✓ ${updates.length} élèves mis à jour.`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
