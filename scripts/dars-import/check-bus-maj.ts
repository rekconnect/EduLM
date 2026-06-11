/**
 * Read-only ANALYSIS of the manually-maintained bus Excel (BUS MAJ):
 *  - "Bus N" sheets = main runs; "Bus N College" = the later evening run for
 *    collège/lycée (same physical bus number).
 *  - Rows: Nom | Classe | Quartier | legs (Matin / Soir / Matin;Soir / M/S /
 *    weekday names for garderie days) | Tel. Garbage rows (totals, Prof,
 *    shifted phones) are skipped and reported.
 * Matches students (accent/doubled-letter tolerant) and reports the FULL DIFF
 * vs bus_periods["2025-2026|T3"]. WRITES NOTHING.
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
const normLevel = (s: string) => deburr(s).toLowerCase().replace(/[^a-z0-9]/g, "");
// Spelling-tolerant token normalizer for hand-typed Lebanese names:
// doubled letters ("rahhal"→"rahal"), y→i ("hayla"→"haila"), sh→ch
// ("hashem"→"hachem"), trailing -eh/-é→-e.
const squash = (t: string) =>
  t
    .replace(/(.)\1+/g, "$1")
    .replace(/y/g, "i")
    .replace(/sh/g, "ch")
    .replace(/eh$/g, "e");

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const file = arg("file");

  // ── Parse the Excel ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  type XRow = {
    name: string;
    classe: string;
    quartier: string;
    matin: boolean;
    soir: boolean;
    days: string;
    bus: string;
    college: boolean;
    sheet: string;
  };
  const xrows: XRow[] = [];
  const anomalies: string[] = [];
  const profs: string[] = [];
  const tbd: string[] = [];
  for (const ws of wb.worksheets) {
    const nm = ws.name.trim();
    if (/^TBD$/i.test(nm)) {
      for (let r = 1; r <= ws.rowCount; r++) {
        const n = cellText(ws, r, 1).trim();
        if (n && !/^\d+$/.test(n)) tbd.push(`${n} (${cellText(ws, r, 2).trim()})`);
      }
      continue;
    }
    const m = /^Bus\s*(\d+)\s*(College)?/i.exec(nm);
    if (!m) continue;
    const bus = m[1]!;
    const college = !!m[2];
    for (let r = 3; r <= ws.rowCount; r++) {
      const name = cellText(ws, r, 1).trim();
      const classe = cellText(ws, r, 2).trim();
      const legsRaw = cellText(ws, r, 4).trim();
      if (!name || /^\d+$/.test(name) || /^total/i.test(name)) continue;
      if (/prof/i.test(classe)) {
        profs.push(`${name} (Bus ${bus}${college ? " College" : ""})`);
        continue;
      }
      if (!legsRaw || /^total/i.test(legsRaw)) continue;
      const legs = deburr(legsRaw).toLowerCase();
      const matin = /matin|m\s*\/\s*s/.test(legs);
      const soir = /soir|m\s*\/\s*s/.test(legs);
      const days = /lundi|mardi|mercredi|jeudi|vendredi/.test(legs) ? legsRaw : "";
      if (!matin && !soir && !days) {
        anomalies.push(`${name} (${classe}, Bus ${bus}${college ? " College" : ""}): trajet="${legsRaw}"`);
        continue;
      }
      xrows.push({
        name,
        classe,
        quartier: cellText(ws, r, 3).trim(),
        matin,
        soir: soir || (!matin && !!days), // garderie-day rows ride home (soir)
        days,
        bus,
        college,
        sheet: nm,
      });
    }
  }
  console.log(`Lignes élèves valides: ${xrows.length} · profs: ${profs.length} · anomalies: ${anomalies.length} · TBD: ${tbd.length}`);

  // ── EduLM students ──
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { academicYear: { label: "2025-2026" } } },
    },
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
    level: normLevel(st.enrollments[0]?.class.level ?? ""),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
  const LEVEL_ALIASES: Record<string, string> = { term: "terminale", tle: "terminale" };
  const lvlNorm = (s: string) => {
    const n = normLevel(s);
    return LEVEL_ALIASES[n] ?? n;
  };

  function match(name: string, classe: string) {
    const tokens = new Set(coreTokens(name).map(squash));
    const lvl = lvlNorm(classe);
    let best: (typeof prepared)[number] | null = null;
    let bestScore = -1;
    let tie = false;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => tokens.has(t)).length;
      if (inter !== p.last.size) continue;
      const rest = [...tokens].filter((t) => !p.last.has(t));
      if (!rest.some((t) => firstOk(p.first, t))) continue;
      const levelOk = lvl !== "" && lvlNorm(p.level) === lvl;
      const score = inter * 2 + (levelOk ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
        tie = false;
      } else if (score === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  // ── Aggregate per student ──
  type X = { matinBus?: string; soirBus?: string; quartier: string; days: string; collegeSoir: boolean };
  const fromExcel = new Map<string, X>();
  const unmatched: string[] = [];
  for (const r of xrows) {
    const target = match(r.name, r.classe);
    if (!target) {
      unmatched.push(`${r.name} (${r.classe}, ${r.sheet}, ${r.matin ? "Matin" : ""}${r.matin && r.soir ? ";" : ""}${r.soir ? "Soir" : ""})`);
      continue;
    }
    const cur = fromExcel.get(target.id) ?? { quartier: r.quartier, days: "", collegeSoir: false };
    if (r.matin) cur.matinBus = r.bus;
    if (r.soir) {
      cur.soirBus = r.bus;
      cur.collegeSoir = r.college;
    }
    if (r.days) cur.days = r.days;
    if (!cur.quartier) cur.quartier = r.quartier;
    fromExcel.set(target.id, cur);
  }
  console.log(`Appariement: ${fromExcel.size} élèves uniques · NON TROUVÉS: ${unmatched.length}`);
  for (const u of unmatched) console.log(`   ✗ ${u}`);

  // ── Current EduLM period ──
  type Cur = { as: boolean; rs: boolean; cm: string; cs: string };
  const current = new Map<string, Cur>();
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    try {
      const periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
      const p = periods[PERIOD];
      if (p && (p.as === "yes" || p.rs === "yes"))
        current.set(s.id, {
          as: p.as === "yes",
          rs: p.rs === "yes",
          cm: (p.car_matin ?? "").trim(),
          cs: (p.car_soir ?? "").trim(),
        });
    } catch {
      /* ignore */
    }
  }

  // ── Diff ──
  const nameOf = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));
  let identical = 0;
  const trajetChanges: string[] = [];
  const busChanges: string[] = [];
  const newAssign: string[] = [];
  for (const [id, x] of fromExcel) {
    const cur = current.get(id);
    const nAs = !!x.matinBus;
    const nRs = !!x.soirBus;
    const nCm = x.matinBus ?? "";
    const nCs = x.soirBus ?? "";
    const lbl = `[${nAs ? "AS " + nCm : ""}${nAs && nRs ? " + " : ""}${nRs ? "RS " + nCs : ""}]`;
    if (!cur) {
      newAssign.push(`${nameOf.get(id)} → ${lbl}`);
      continue;
    }
    const trajetSame = cur.as === nAs && cur.rs === nRs;
    const busSame = cur.cm === nCm && cur.cs === nCs;
    if (trajetSame && busSame) {
      identical++;
      continue;
    }
    const label = `${nameOf.get(id)}: [${cur.as ? "AS " + (cur.cm || "?") : ""}${cur.as && cur.rs ? " + " : ""}${cur.rs ? "RS " + (cur.cs || "?") : ""}] → ${lbl}`;
    if (!trajetSame) trajetChanges.push(label);
    else busChanges.push(label);
  }
  const removed: string[] = [];
  for (const [id, cur] of current) {
    if (!fromExcel.has(id))
      removed.push(`${nameOf.get(id)} [${cur.as ? "AS " + (cur.cm || "?") : ""}${cur.as && cur.rs ? "+" : ""}${cur.rs ? "RS " + (cur.cs || "?") : ""}]`);
  }

  console.log(`\n=== DIFF vs EduLM (${PERIOD}) ===`);
  console.log(`identiques: ${identical}`);
  console.log(`\nTRAJET différent: ${trajetChanges.length}`);
  for (const c of trajetChanges) console.log(`   • ${c}`);
  console.log(`\nBUS différent (même trajet): ${busChanges.length}`);
  for (const c of busChanges) console.log(`   • ${c}`);
  console.log(`\nNOUVEAUX (Excel, sans affectation EduLM): ${newAssign.length}`);
  for (const c of newAssign) console.log(`   • ${c}`);
  console.log(`\nABSENTS de l'Excel (affectés dans EduLM): ${removed.length}`);
  for (const c of removed) console.log(`   • ${c}`);

  console.log(`\n=== Annexes ===`);
  console.log(`Profs dans les bus: ${profs.length} → ${profs.join(" · ")}`);
  console.log(`TBD (à placer): ${tbd.length} → ${tbd.join(" · ")}`);
  console.log(`Anomalies de saisie: ${anomalies.length}`);
  for (const a of anomalies) console.log(`   ⚠ ${a}`);
  const withDays = [...fromExcel.entries()].filter(([, x]) => x.days);
  console.log(`Jours spécifiques (activités): ${withDays.length}`);
  for (const [id, x] of withDays.slice(0, 15)) console.log(`   • ${nameOf.get(id)}: ${x.days.replace(/\n/g, " ")}`);

  // ── Projected stats ──
  const xs = [...fromExcel.values()];
  const pAs = xs.filter((x) => x.matinBus).length;
  const pRs = xs.filter((x) => x.soirBus).length;
  const pBoth = xs.filter((x) => x.matinBus && x.soirBus);
  const pSame = pBoth.filter((x) => x.matinBus === x.soirBus).length;
  console.log(`\n=== Stats si l'Excel est appliqué ===`);
  console.log(`Inscrits=${fromExcel.size}  Aller=${pAs}  Retour=${pRs}  AR=${pBoth.length} (même bus=${pSame}, 2 bus=${pBoth.length - pSame})`);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
