/**
 * Import the two Dars transport exports into EduLM's /transport fields —
 * PER DIRECTION (a pupil can ride different cars morning vs evening, from
 * different quartiers: e.g. AS Car 1 Antelias + RS Car 8 Naccache):
 *
 *  --station  rptTrsEleveStation.xlsx — one sheet per Car ("Car N° <n>" in the
 *             header). Row trajet says what the pupil does ON THIS CAR:
 *             AS → matin, RS → soir, AR → both. "Quartier , Station" per row.
 *  --liste    TrsRptListeEleveAutocarParClasse.xlsx — flat list of ALL bus
 *             registrants ("Nom d'Élève" = NOM Prénom · Classe · Bus Number ·
 *             Type). One row per direction for two-car pupils.
 *
 * bus_trajet is DERIVED from the union of directions seen (matin+soir → AR).
 * Matching: station file by FAMILY CODE + first name (name fallback); liste by
 * surname+firstname tokens with class tiebreak. Montant/Payé ignored (the
 * accounting Excel stays the money source). Legacy single-car keys removed.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-bus-exports.ts --tenant-name="Lycée Montaigne" \
 *     --station="...rptTrsEleveStation.xlsx" --liste="...TrsRptListeEleveAutocarParClasse.xlsx" [--confirm]
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { coreTokens, normFirst, normClass } from "./lib/match-services.js";

const prisma = new PrismaClient();
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

type Dir = { car?: string; zone?: string; station?: string };
type Assign = { matin?: Dir; soir?: Dir };

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const stationPath = arg("station");
  const listePath = arg("liste");
  if (!stationPath && !listePath) {
    console.error("Pass --station=... and/or --liste=...");
    process.exit(1);
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { academicYear: { isActive: true } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      family: { select: { code: true } },
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { class: { select: { name: true } } },
        take: 1,
      },
    },
  });
  console.log(`Active-year students: ${students.length}`);

  const byFamily = new Map<string, typeof students>();
  for (const st of students) {
    const code = (st.family?.code ?? "").trim().toUpperCase();
    if (!code) continue;
    const a = byFamily.get(code) ?? [];
    a.push(st);
    byFamily.set(code, a);
  }
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName)),
    first: normFirst(st.firstName),
    cls: normClass(st.enrollments[0]?.class.name ?? ""),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));

  function matchByName(nameTokens: Set<string>, exFirst: string, exClass: string) {
    let best: (typeof prepared)[number] | null = null;
    let bestScore = -1;
    let tie = false;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => nameTokens.has(t)).length;
      if (inter !== p.last.size) continue;
      if (!firstOk(p.first, exFirst)) continue;
      const classOk = exClass !== "" && p.cls === exClass;
      const score = inter * 2 + (classOk ? 4 : 0) + (p.first === exFirst ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
        tie = false;
      } else if (score === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  const assigns = new Map<string, Assign>();
  const mergeDir = (id: string, which: "matin" | "soir", d: Dir, overwrite: boolean) => {
    const cur = assigns.get(id) ?? {};
    const slot: Dir = cur[which] ?? {};
    for (const [k, v] of Object.entries(d) as Array<[keyof Dir, string | undefined]>) {
      if (!v) continue;
      if (overwrite || !slot[k]) slot[k] = v;
    }
    cur[which] = slot;
    assigns.set(id, cur);
  };

  // Tel / Montant / Payé from the station manifests (amount can sit on either
  // direction's row — e.g. 380 on the AS row, 0 on the RS row — so we SUM).
  const telBy = new Map<string, string>();
  const montantBy = new Map<string, number>();
  const payeBy = new Map<string, number>();

  // ── Station file (per-car sheets, authoritative) ──
  if (stationPath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(stationPath);
    let matched = 0;
    const unmatched: string[] = [];
    for (const ws of wb.worksheets) {
      let car = "";
      let headerRow = 0;
      const cols: Record<string, number> = {};
      for (let r = 1; r <= Math.min(ws.rowCount, 12) && (!car || !headerRow); r++) {
        for (let c = 1; c <= Math.min(ws.columnCount, 18); c++) {
          const m = /Car\s*N°\s*(\d+)/i.exec(cellText(ws, r, c));
          if (m && !car) car = m[1]!;
        }
        const rowTexts: string[] = [];
        for (let c = 1; c <= Math.min(ws.columnCount, 18); c++) rowTexts.push(cellText(ws, r, c).trim());
        if (rowTexts.includes("Trajet") && rowTexts.some((x) => x === "Famille")) {
          headerRow = r;
          for (let c = 1; c <= rowTexts.length; c++) {
            const label = rowTexts[c - 1]!;
            if (label && cols[label] == null) cols[label] = c;
          }
        }
      }
      if (!headerRow) continue;
      const col = (label: string) => cols[label] ?? 0;

      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const famille = cellText(ws, r, col("Famille")).trim();
        const prenom = cellText(ws, r, col("Prénom")).trim();
        if (!famille && !prenom) continue;
        const code = cellText(ws, r, col("Code")).trim().toUpperCase();
        const cl = cellText(ws, r, col("Cl")).trim();
        const sSec = cellText(ws, r, col("S")).trim();
        const trajet = cellText(ws, r, col("Trajet")).trim().toUpperCase();
        const quartierStation = cellText(ws, r, col("Quartier , Station")).trim();

        let target: (typeof students)[number] | null = null;
        if (code && byFamily.has(code)) {
          const cands = byFamily.get(code)!.filter((x) => firstOk(normFirst(x.firstName), normFirst(prenom)));
          if (cands.length === 1) target = cands[0]!;
          else if (cands.length > 1) {
            const cls = normClass(cl + sSec);
            const byCls = cands.filter((x) => normClass(x.enrollments[0]?.class.name ?? "") === cls);
            if (byCls.length === 1) target = byCls[0]!;
          }
        }
        if (!target)
          target = matchByName(new Set(coreTokens(famille)), normFirst(prenom), normClass(cl + sSec));
        if (!target) {
          unmatched.push(`${famille} ${prenom} (${code || "?"}, ${cl} ${sSec}, car ${car})`);
          continue;
        }
        matched++;
        const tel = cellText(ws, r, col("Tel")).trim();
        if (tel && !telBy.has(target.id)) telBy.set(target.id, tel);
        const montant = Number(cellText(ws, r, col("Montant")).trim());
        if (Number.isFinite(montant))
          montantBy.set(target.id, (montantBy.get(target.id) ?? 0) + montant);
        const paye = Number(cellText(ws, r, col("Payé")).trim());
        if (Number.isFinite(paye))
          payeBy.set(target.id, (payeBy.get(target.id) ?? 0) + paye);
        const commaAt = quartierStation.indexOf(",");
        const zone = (commaAt >= 0 ? quartierStation.slice(0, commaAt) : quartierStation).trim();
        const station = commaAt >= 0 ? quartierStation.slice(commaAt + 1).replace(/\s+/g, " ").trim() : "";
        const d: Dir = { car, zone, station };
        // AS → this car serves the MORNING leg; RS → the EVENING leg; AR → both.
        if (trajet === "AS" || trajet === "AR") mergeDir(target.id, "matin", d, true);
        if (trajet === "RS" || trajet === "AR") mergeDir(target.id, "soir", d, true);
      }
    }
    console.log(`\nSTATION file: matched ${matched} rows · UNMATCHED ${unmatched.length}`);
    for (const u of unmatched.slice(0, 25)) console.log(`   ✗ ${u}`);
    if (unmatched.length > 25) console.log(`   … +${unmatched.length - 25} more`);
  }

  // ── Liste file (all bus registrants; one row per direction) ──
  // Snapshot of manifest-covered students BEFORE the liste loop, so a
  // liste-only student's first row doesn't block their second row.
  const stationCovered = new Set(assigns.keys());
  if (listePath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(listePath);
    const ws = wb.worksheets[0];
    if (ws) {
      let headerRow = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
        if (cellText(ws, r, 1).trim().startsWith("Nom d")) {
          headerRow = r;
          break;
        }
      }
      let matched = 0;
      const unmatched: string[] = [];
      const seen = new Set<string>();
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const name = cellText(ws, r, 1).trim();
        if (!name || name.startsWith("Nom d")) continue;
        const classe = cellText(ws, r, 3).trim();
        const busNum = cellText(ws, r, 4).trim();
        const type = cellText(ws, r, 5).trim().toUpperCase();
        const key = `${name}|${classe}|${type}|${busNum}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const tokens = new Set(coreTokens(name));
        let target: (typeof students)[number] | null = null;
        for (const p of prepared) {
          if (p.last.size === 0) continue;
          const inter = [...p.last].filter((t) => tokens.has(t)).length;
          if (inter !== p.last.size) continue;
          const rest = [...tokens].filter((t) => !p.last.has(t));
          if (!rest.some((t) => firstOk(p.first, t))) continue;
          const classOk = normClass(classe) !== "" && p.cls === normClass(classe);
          if (target && target.id !== p.st.id) {
            if (classOk) target = p.st;
            continue;
          }
          if (classOk || !target) target = p.st;
        }
        if (!target) {
          unmatched.push(`${name} (${classe})`);
          continue;
        }
        matched++;
        // The station manifests are the authority (the Dars dashboard counts
        // them). The liste runs stale direction flags (e.g. RS rows the
        // manifests don't confirm) — only use it for students with NO
        // manifest data at all (registered but not assigned to any car).
        if (stationCovered.has(target.id)) continue;
        const d: Dir = busNum && busNum !== "0" ? { car: busNum } : {};
        if (type === "AS" || type === "AR") mergeDir(target.id, "matin", d, false);
        if (type === "RS" || type === "AR") mergeDir(target.id, "soir", d, false);
      }
      console.log(`\nLISTE file: matched ${matched} rows · UNMATCHED ${unmatched.length}`);
      for (const u of unmatched.slice(0, 25)) console.log(`   ✗ ${u}`);
      if (unmatched.length > 25) console.log(`   … +${unmatched.length - 25} more`);
    }
  }

  // ── Period (assignments are per year + trimester) ──
  const activeYearRow = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  const yearLabel = arg("year") || activeYearRow?.label || "";
  const trim = (arg("trim") || "T3").toUpperCase();
  if (!/^T[123]$/.test(trim) || !yearLabel) {
    console.error("Bad --trim (T1|T2|T3) or no year label resolvable.");
    process.exit(1);
  }
  const period = `${yearLabel}|${trim}`;
  console.log(`\nTarget period: ${period}`);

  // ── Diff vs current customAnswers (writes bus_periods[period]) ──
  // All pre-period flat keys are superseded; bus_zone stays (quartier seed).
  const LEGACY = [
    "bus_trajet", "bus_car", "bus_station", "bus_heure", "bus_matin", "bus_soir",
    "bus_pre_activite", "bus_as", "bus_rs", "bus_car_matin", "bus_zone_matin",
    "bus_station_matin", "bus_car_soir", "bus_zone_soir", "bus_station_soir",
    "bus_remarques", "bus_tel", "bus_montant", "bus_paye",
  ];
  const byId = new Map(students.map((st) => [st.id, st]));
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  let twoCars = 0;
  for (const [id, a] of assigns) {
    const st = byId.get(id);
    if (!st) continue;
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
    const entry: Record<string, string> = {
      as: a.matin ? "yes" : "",
      rs: a.soir ? "yes" : "",
      car_matin: a.matin?.car ?? "",
      zone_matin: a.matin?.zone ?? "",
      station_matin: a.matin?.station ?? "",
      car_soir: a.soir?.car ?? "",
      zone_soir: a.soir?.zone ?? "",
      station_soir: a.soir?.station ?? "",
      remarques: periods[period]?.remarques ?? "",
      ...(telBy.has(id) ? { tel: telBy.get(id)! } : {}),
      ...(montantBy.has(id) || payeBy.has(id)
        ? { montant: String(montantBy.get(id) ?? 0), paye: String(payeBy.get(id) ?? 0) }
        : {}),
    };
    if (entry.car_matin && entry.car_soir && entry.car_matin !== entry.car_soir) twoCars++;
    const before = JSON.stringify(periods[period] ?? {});
    periods[period] = entry;
    let changed = before !== JSON.stringify(entry);
    if (changed) ca.bus_periods = JSON.stringify(periods);
    for (const k of LEGACY) {
      if (k in ca) {
        delete ca[k];
        changed = true;
        ca.bus_periods = JSON.stringify(periods);
      }
    }
    if (changed)
      updates.push({
        id,
        ca,
        label:
          `${st.lastName} ${st.firstName}: ${[entry.as && "AS", entry.rs && "RS"].filter(Boolean).join("+")}` +
          ` · matin[${entry.car_matin || "-"} ${entry.zone_matin}]` +
          ` · soir[${entry.car_soir || "-"} ${entry.zone_soir}]`,
      });
  }
  console.log(`\nStudents to update: ${updates.length} (matched total ${assigns.size}; different matin/soir cars: ${twoCars})`);
  for (const u of updates.slice(0, 12)) console.log(`   • ${u.label}`);
  if (updates.length > 12) console.log(`   … +${updates.length - 12} more`);

  if (!CONFIRM) {
    console.log("\nDry-run. Re-run with --confirm to write.");
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
  console.log(`✓ Imported bus assignments for ${done} students.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
