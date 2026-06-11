/**
 * REVERT (per Raed): the 30 students removed as "absent from BUS MAJ" are in
 * fact in the fresh Dars liste export → restore their T3 assignment from the
 * Dars files (station manifests authoritative + liste fallback, same logic as
 * import-bus-exports), WITHOUT touching students covered by the BUS MAJ Excel
 * (their hand corrections stay). Run sync-dossier-from-bus afterwards.
 *
 *   npx tsx scripts/dars-import/restore-bus-absents.ts --tenant-name="..." \
 *     --station="...rptTrsEleveStation.xlsx" --liste="...Downloads\TrsRptListeEleveAutocarParClasse.xlsx" \
 *     --busmaj="...tmp-bus-maj.xlsx" [--confirm]
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { coreTokens, normFirst, normClass } from "./lib/match-services.js";

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
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const squash = (t: string) =>
  t.replace(/y/g, "i").replace(/sh/g, "ch").replace(/ph/g, "f").replace(/th/g, "t").replace(/eh$/g, "e").replace(/(.)\1+/g, "$1");
const rawKey = (s: string) => deburr(s).toLowerCase().replace(/\s+/g, " ").trim();
const looksLikeLevel = (s: string) =>
  /^(ps|ms|gs|cp|ce|cm|6|5|4|3|2nde|2 nde|1ere|1 ere|term|tle)/i.test(deburr(s).trim());

// Same aliases as import-bus-maj / fix-bus-absents (validated by Raed).
const ALIASES: Record<string, { first: string; last: string }> = {
  "michael bou kazi": { first: "Michel", last: "Boukazi" },
  "michel bou kazi": { first: "Michel", last: "Boukazi" },
  "raphael bou kazi": { first: "Raphael", last: "Boukazi" },
  "gabriel bou kazi": { first: "Gabriel", last: "Boukazi" },
  "cecilia yaziji": { first: "Cécilia", last: "Yazegi" },
  "sophia keyrouz": { first: "Sofia", last: "Keyrouz" },
  "sofia keryouz": { first: "Sofia", last: "Keyrouz" },
  "khoury (el) axelle": { first: "Axelle", last: "Khoury" },
  "jabr emmanuelle": { first: "Emmanuelle", last: "Jabre" },
  "thalia khalil": { first: "Talia", last: "Khalil" },
  "roger paul abou jaoude": { first: "Roger", last: "Elia Abou Jaoude" },
  "andrea semergian": { first: "Andréa", last: "Semerjian" },
  "matheas karam": { first: "Mathias", last: "Karam" },
  "joe mechaalani": { first: "Joe", last: "Machaalani" },
  "albert morkos": { first: "Albert", last: "Morcos" },
  "fouad morkos": { first: "Fouad", last: "Morcos" },
  "antoine abi azar": { first: "Antoine", last: "Abou Azar" },
  "ghanem laetitia": { first: "Laeticia", last: "Ghanem" },
  "feghali yasmine": { first: "Yasmine", last: "Khaled Feghali" },
  "chris saliba": { first: "Cielo", last: "Saliba" },
  "roukos paul": { first: "Paul", last: "Roukoz" },
  "roukos yana": { first: "Yana", last: "Roukoz" },
  "philippe el hajj": { first: "Philippe", last: "Hage" },
  "marilyn salloum": { first: "Marilynn", last: "Chaaya Salloum" },
  "helene el khourey": { first: "Helene", last: "Khoury" },
  "fidawi matheo": { first: "Matteo", last: "Fidawi" },
  "fidawi geovani": { first: "Giovanni", last: "Fidawi" },
  "johnathan harbouk": { first: "Jonathan", last: "Harbouk" },
  "moawad joya": { first: "Joya", last: "Hanna Moawad" },
  "moawad tala": { first: "Tala", last: "Hanna Moawad" },
  "moawad jad": { first: "Jad", last: "Hanna Moawad" },
  "katlyn el ramy": { first: "Katelyn", last: "Rami" },
  "kaia hajj": { first: "Kaia", last: "Hage" },
  "kahi veronica": { first: "Véronica", last: "Kai" },
  "milana elhayek": { first: "Milana", last: "Hayeck" },
  "rita tauk": { first: "Rita", last: "Tawk" },
  "abdelsater sky": { first: "Sky", last: "Abdel Sater" },
  "mathieu assis": { first: "Mathieu", last: "Assi" },
  "zoe attic": { first: "Zoé", last: "Atik" },
  "kahi chris": { first: "Chris", last: "Kahi" },
  "luna el hajj": { first: "Luna", last: "Hage" },
  "lea el hajj": { first: "Léa", last: "Hage" },
};

type Dir = { car?: string; zone?: string; station?: string };
type Assign = { matin?: Dir; soir?: Dir };

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { label: "2025-2026" } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      family: { select: { code: true } },
      enrollments: {
        where: { academicYear: { label: "2025-2026" } },
        select: { class: { select: { name: true, level: true } } },
        take: 1,
      },
    },
  });
  const byFamily = new Map<string, typeof students>();
  for (const st of students) {
    const code = (st.family?.code ?? "").trim().toUpperCase();
    if (!code) continue;
    const a = byFamily.get(code) ?? [];
    a.push(st);
    byFamily.set(code, a);
  }
  const normLevel = (s: string) => deburr(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName).map(squash)),
    first: squash(normFirst(st.firstName)),
    cls: normClass(st.enrollments[0]?.class.name ?? ""),
    level: normLevel(st.enrollments[0]?.class.level ?? ""),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
  function findByAlias(a: { first: string; last: string }) {
    const lastT = new Set(coreTokens(a.last).map(squash));
    const firstN = squash(normFirst(a.first));
    return (
      prepared.find(
        (p) => p.last.size === lastT.size && [...p.last].every((t) => lastT.has(t)) && firstOk(p.first, firstN),
      )?.st ??
      prepared.find((p) => [...lastT].every((t) => p.last.has(t)) && firstOk(p.first, firstN))?.st ??
      null
    );
  }
  function matchTokens(name: string, classeOrLevel: string) {
    const alias = ALIASES[rawKey(name)];
    if (alias) return findByAlias(alias);
    const tk = new Set(coreTokens(name).map(squash));
    const lvl = normLevel(classeOrLevel).replace(/[abcd]$/, "");
    let best: (typeof prepared)[number] | null = null;
    let tie = false;
    let bestScore = -1;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => tk.has(t)).length;
      if (inter !== p.last.size) continue;
      const rest = [...tk].filter((t) => !p.last.has(t));
      if (!rest.some((t) => firstOk(p.first, t))) continue;
      const levelOk = lvl !== "" && (p.level === lvl || p.cls === normClass(classeOrLevel));
      const score = inter * 2 + (levelOk ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
        tie = false;
      } else if (score === bestScore && best && p.st.id !== best.st.id) tie = true;
    }
    return best && !tie ? best.st : null;
  }

  // ── 1. BUS MAJ matched set (these stay untouched) ──
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(arg("busmaj"));
    var inBusMaj = new Set<string>();
    for (const ws of wb.worksheets) {
      if (!/^Bus\s*\d+/i.test(ws.name.trim())) continue;
      for (let r = 3; r <= ws.rowCount; r++) {
        let name = cellText(ws, r, 1).trim();
        let classe = cellText(ws, r, 2).trim();
        const legsRaw = cellText(ws, r, 4).trim();
        if (!name || /^\d+$/.test(name) || /^total/i.test(name) || /^\[object/.test(name)) continue;
        if (/prof/i.test(classe)) continue;
        if (!legsRaw || /^total/i.test(legsRaw)) continue;
        const legs = deburr(legsRaw).toLowerCase();
        if (/lundi|mardi|mercredi|jeudi|vendredi/.test(legs) && classe && !looksLikeLevel(classe)) {
          name = `${name} ${classe}`;
          classe = "";
        }
        const t = matchTokens(name, classe);
        if (t) inBusMaj.add(t.id);
      }
    }
    console.log(`Couverts par BUS MAJ (intouchés): ${inBusMaj.size}`);
  }

  // ── 2. Dars files → per-direction assignment (station authoritative) ──
  const assigns = new Map<string, Assign>();
  const telBy = new Map<string, string>();
  const montantBy = new Map<string, number>();
  const payeBy = new Map<string, number>();
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

  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(arg("station"));
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
      const col = (l: string) => cols[l] ?? 0;
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
          const cands = byFamily.get(code)!.filter((x) => firstOk(squash(normFirst(x.firstName)), squash(normFirst(prenom))));
          if (cands.length === 1) target = cands[0]!;
          else if (cands.length > 1) {
            const cls = normClass(cl + sSec);
            const byCls = cands.filter((x) => normClass(x.enrollments[0]?.class.name ?? "") === cls);
            if (byCls.length === 1) target = byCls[0]!;
          }
        }
        if (!target) target = matchTokens(`${famille} ${prenom}`, cl + sSec);
        if (!target) continue;
        const tel = cellText(ws, r, col("Tel")).trim();
        if (tel && !telBy.has(target.id)) telBy.set(target.id, tel);
        const montant = Number(cellText(ws, r, col("Montant")).trim());
        if (Number.isFinite(montant)) montantBy.set(target.id, (montantBy.get(target.id) ?? 0) + montant);
        const paye = Number(cellText(ws, r, col("Payé")).trim());
        if (Number.isFinite(paye)) payeBy.set(target.id, (payeBy.get(target.id) ?? 0) + paye);
        const commaAt = quartierStation.indexOf(",");
        const zone = (commaAt >= 0 ? quartierStation.slice(0, commaAt) : quartierStation).trim();
        const station = commaAt >= 0 ? quartierStation.slice(commaAt + 1).replace(/\s+/g, " ").trim() : "";
        const d: Dir = { car, zone, station };
        if (trajet === "AS" || trajet === "AR") mergeDir(target.id, "matin", d, true);
        if (trajet === "RS" || trajet === "AR") mergeDir(target.id, "soir", d, true);
      }
    }
  }
  const stationCovered = new Set(assigns.keys());
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(arg("liste"));
    const ws = wb.worksheets[0]!;
    let headerRow = 0;
    for (let r = 1; r <= 12; r++)
      if (cellText(ws, r, 1).trim().startsWith("Nom d")) {
        headerRow = r;
        break;
      }
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const name = cellText(ws, r, 1).trim();
      if (!name || name.startsWith("Nom d")) continue;
      const classe = cellText(ws, r, 3).trim();
      const busNum = cellText(ws, r, 4).trim();
      const type = cellText(ws, r, 5).trim().toUpperCase();
      const target = matchTokens(name, classe);
      if (!target || stationCovered.has(target.id)) continue;
      const d: Dir = busNum && busNum !== "0" ? { car: busNum } : {};
      if (type === "AS" || type === "AR") mergeDir(target.id, "matin", d, false);
      if (type === "RS" || type === "AR") mergeDir(target.id, "soir", d, false);
    }
  }

  // ── 3. Restore ONLY students NOT covered by BUS MAJ ──
  const byId = new Map(students.map((s) => [s.id, s]));
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  for (const [id, a] of assigns) {
    if (inBusMaj.has(id)) continue;
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
      remarques: periods[PERIOD]?.remarques ?? "",
      ...(telBy.has(id) ? { tel: telBy.get(id)! } : {}),
      ...(montantBy.has(id) || payeBy.has(id)
        ? { montant: String(montantBy.get(id) ?? 0), paye: String(payeBy.get(id) ?? 0) }
        : {}),
    };
    if (JSON.stringify(periods[PERIOD] ?? {}) === JSON.stringify(entry)) continue;
    periods[PERIOD] = entry;
    ca.bus_periods = JSON.stringify(periods);
    updates.push({
      id,
      ca,
      label:
        `${st.lastName} ${st.firstName}: ${[entry.as && "AS " + entry.car_matin, entry.rs && "RS " + entry.car_soir].filter(Boolean).join(" + ")}` +
        `${entry.montant ? ` · payé ${entry.paye}/${entry.montant}$` : ""}`,
    });
  }

  console.log(`\nÀ RESTAURER (hors BUS MAJ): ${updates.length}`);
  for (const u of updates) console.log(`   • ${u.label}`);

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
  }
  console.log(`✓ ${done} élèves restaurés.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
