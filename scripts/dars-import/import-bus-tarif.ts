/**
 * Apply the AUTHORITATIVE rptTrsEleveActiviteTarif.xlsx to bus_periods
 * ["2025-2026|T3"] — CAREFUL FUSION per Raed's instruction ("the file lacks
 * the activity returns — make sure before deleting/overwriting"):
 *   - Matching by student Code ↔ customAnswers.dars_student_code (100% exact).
 *   - For each matched student: a direction PRESENT in the file wins (car,
 *     zone "Z<n> · Quartier", station); a direction ABSENT from the file but
 *     present in EduLM is KEPT (activity return).
 *   - Money: montant (brut) / remise % / net from the file (authoritative).
 *   - Tel: "P: père · M: mère". Remarques kept.
 *   - Students NOT in the file (the ~55 activity-return / manifest students)
 *     are left completely untouched.
 * Run sync-dossier-from-bus afterwards to align the fiches.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-bus-tarif.ts --tenant-name="Lycée Montaigne" \
 *     --file="C:\Users\raede\Downloads\rptTrsEleveActiviteTarif.xlsx" [--confirm]
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";
const CONFIRM = process.argv.includes("--confirm");
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

type XDir = { car: string; zone: string; station: string };
type X = {
  nom: string;
  prenom: string;
  matin?: XDir;
  soir?: XDir;
  montant: number;
  net: number;
  pourc: number;
  tel: string;
};

function dirFrom(ws: ExcelJS.Worksheet, r: number): XDir {
  const quartierStation = cellText(ws, r, 19).trim();
  const zoneNo = cellText(ws, r, 18).trim();
  const commaAt = quartierStation.indexOf(",");
  const quartier = (commaAt >= 0 ? quartierStation.slice(0, commaAt) : quartierStation).trim();
  const station = commaAt >= 0 ? quartierStation.slice(commaAt + 1).replace(/\s+/g, " ").trim() : "";
  return {
    car: cellText(ws, r, 14).trim(),
    zone: zoneNo ? `Z${zoneNo} · ${quartier}` : quartier,
    station,
  };
}

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arg("file"));
  const ws = wb.worksheets[0]!;
  const byCode = new Map<string, X>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = cellText(ws, r, 2).trim().toUpperCase();
    const nom = cellText(ws, r, 4).trim();
    if (!code || !nom) continue;
    const type = cellText(ws, r, 15).trim().toUpperCase();
    const telPere = cellText(ws, r, 12).trim();
    const telMere = cellText(ws, r, 13).trim();
    const cur: X =
      byCode.get(code) ??
      ({
        nom,
        prenom: cellText(ws, r, 5).trim(),
        montant: 0,
        net: 0,
        pourc: 0,
        tel: [telPere && `P: ${telPere}`, telMere && `M: ${telMere}`].filter(Boolean).join(" · "),
      } as X);
    const d = dirFrom(ws, r);
    if (type === "AS" || type === "AR") cur.matin = d;
    if (type === "RS" || type === "AR") cur.soir = d;
    cur.montant += Number(cellText(ws, r, 22).trim()) || 0;
    cur.net += Number(cellText(ws, r, 25).trim()) || 0;
    cur.pourc = Math.max(cur.pourc, Number(cellText(ws, r, 24).trim()) || 0);
    byCode.set(code, cur);
  }
  console.log(`Fichier tarif: ${byCode.size} élèves`);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: "2025-2026" } } } },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });
  const byDarsCode = new Map<string, (typeof students)[number]>();
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const c = String(ca.dars_student_code ?? "").trim().toUpperCase();
    if (c) byDarsCode.set(c, s);
  }

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  let matched = 0;
  let keptSoir = 0;
  let keptMatin = 0;
  const unmatched: string[] = [];
  for (const [code, x] of byCode) {
    const st = byDarsCode.get(code);
    if (!st) {
      unmatched.push(`${x.nom} ${x.prenom} (code ${code})`);
      continue;
    }
    matched++;
    const ca: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};
    let periods: Record<string, Record<string, string>> = {};
    if (typeof ca.bus_periods === "string") {
      try {
        periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
      } catch {
        periods = {};
      }
    }
    const prev = periods[PERIOD] ?? {};

    // Direction in the file → file wins. Direction absent from the file but
    // present in EduLM → KEEP IT (activity return, not in this export).
    const matin: XDir | null = x.matin
      ? x.matin
      : prev.as === "yes"
        ? { car: prev.car_matin ?? "", zone: prev.zone_matin ?? "", station: prev.station_matin ?? "" }
        : null;
    if (!x.matin && prev.as === "yes") keptMatin++;
    const soir: XDir | null = x.soir
      ? x.soir
      : prev.rs === "yes"
        ? { car: prev.car_soir ?? "", zone: prev.zone_soir ?? "", station: prev.station_soir ?? "" }
        : null;
    if (!x.soir && prev.rs === "yes") keptSoir++;

    const entry: Record<string, string> = {
      as: matin ? "yes" : "",
      rs: soir ? "yes" : "",
      car_matin: matin?.car ?? "",
      zone_matin: matin?.zone ?? "",
      station_matin: matin?.station ?? "",
      car_soir: soir?.car ?? "",
      zone_soir: soir?.zone ?? "",
      station_soir: soir?.station ?? "",
      remarques: prev.remarques ?? "",
      tel: x.tel || prev.tel || "",
      montant: String(x.montant),
      remise: x.pourc ? String(x.pourc) : "",
      net: String(x.net),
    };
    if (JSON.stringify(prev) === JSON.stringify(entry)) continue;
    periods[PERIOD] = entry;
    ca.bus_periods = JSON.stringify(periods);
    updates.push({
      id: st.id,
      ca,
      label:
        `${st.lastName} ${st.firstName}: ${[entry.as && "AS " + entry.car_matin, entry.rs && "RS " + entry.car_soir].filter(Boolean).join(" + ")}` +
        ` · ${entry.zone_matin || entry.zone_soir} · net ${entry.net}$${entry.remise ? ` (-${entry.remise}%)` : ""}`,
    });
  }

  console.log(`Appariés par code: ${matched} · non trouvés: ${unmatched.length}`);
  for (const u of unmatched) console.log(`   ✗ ${u}`);
  console.log(`Sens conservés (hors fichier = activité): matin ${keptMatin} · soir ${keptSoir}`);
  console.log(`\nÀ mettre à jour: ${updates.length}`);
  for (const u of updates.slice(0, 12)) console.log(`   • ${u.label}`);
  if (updates.length > 12) console.log(`   … +${updates.length - 12}`);

  if (!CONFIRM) {
    console.log("\n🟡 DRY-RUN — relancez avec --confirm pour écrire.");
    await prisma.$disconnect();
    return;
  }
  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) =>
            prisma.student.update({
              where: { id: u.id },
              data: { customAnswers: u.ca as Prisma.InputJsonValue },
            }),
          ),
        );
        done += chunk.length;
        break;
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    if (done % 100 < 5) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`✓ Tarifs/affectations appliqués: ${done} élèves.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
