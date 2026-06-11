/**
 * Apply the manually-maintained bus Excel (BUS MAJ) to EduLM — MERGE mode:
 * students present in the Excel get their bus_periods["2025-2026|T3"] entry
 * REPLACED by the Excel truth (as/rs, bus per direction, quartier/station,
 * collège-run + garderie-day remarks); students absent from the Excel keep
 * their current assignment (the 34 absents stay as-is).
 *
 * Sheet model: "Bus N" = main run · "Bus N College" = later evening run for
 * collège/lycée (same physical bus) · garderie rows carry a weekday in the
 * legs column and may split the name across cols 1-2 (Nom | Prénom).
 * Spelling-tolerant matching + manual aliases validated by Raed.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-bus-maj.ts --tenant-name="Lycée Montaigne" \
 *     --file="C:\...\tmp-bus-maj.xlsx" [--confirm]
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { coreTokens, normFirst } from "./lib/match-services.js";

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
// Spelling-tolerant normalizer — transliteration rules FIRST, doubled-letter
// collapse LAST (so kiyan→kiian→kian works).
const squash = (t: string) =>
  t
    .replace(/y/g, "i")
    .replace(/sh/g, "ch")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/eh$/g, "e")
    .replace(/(.)\1+/g, "$1");
const rawKey = (s: string) => deburr(s).toLowerCase().replace(/\s+/g, " ").trim();
// Class-level cell? ("4eme", "CM2B", "PS", "Term", "2nde", "CPB", "MSA"…)
const looksLikeLevel = (s: string) =>
  /^(ps|ms|gs|cp|ce|cm|6|5|4|3|2nde|2 nde|1ere|1 ere|term|tle)/i.test(deburr(s).trim());

// ── Manual aliases (the similarity pairs validated by Raed) ──
// Excel raw name (lowercased, deburred) → EduLM "First|Last" lookup.
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
// Excel names confirmed NOT in EduLM — never match, just report.
const KNOWN_UNKNOWN = new Set(["mia keyrouz", "isabella daoud"]);

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
    tel: string;
  };
  const xrows: XRow[] = [];
  const skipped: string[] = [];
  for (const ws of wb.worksheets) {
    const m = /^Bus\s*(\d+)\s*(College)?/i.exec(ws.name.trim());
    if (!m) continue;
    const bus = m[1]!;
    const college = !!m[2];
    for (let r = 3; r <= ws.rowCount; r++) {
      let name = cellText(ws, r, 1).trim();
      let classe = cellText(ws, r, 2).trim();
      const legsRaw = cellText(ws, r, 4).trim();
      if (!name || /^\d+$/.test(name) || /^total/i.test(name) || /^\[object/.test(name)) continue;
      if (/prof/i.test(classe)) continue;
      if (!legsRaw || /^total/i.test(legsRaw)) continue;
      const legs = deburr(legsRaw).toLowerCase();
      const days = /lundi|mardi|mercredi|jeudi|vendredi/.test(legs) ? legsRaw : "";
      // Garderie rows often split Nom | Prénom across cols 1-2.
      if (days && classe && !looksLikeLevel(classe)) {
        name = `${name} ${classe}`;
        classe = "";
      }
      const matin = /matin|m\s*\/\s*s/.test(legs);
      const soir = /soir|m\s*\/\s*s/.test(legs) || (!/matin/.test(legs) && !!days);
      if (!matin && !soir) {
        skipped.push(`${name} (${classe}, Bus ${bus}): trajet="${legsRaw}"`);
        continue;
      }
      xrows.push({
        name,
        classe,
        quartier: cellText(ws, r, 3).trim(),
        matin,
        soir,
        days,
        bus,
        college,
        tel: cellText(ws, r, 5).trim(),
      });
    }
  }
  console.log(`Lignes valides: ${xrows.length} · ignorées (anomalies): ${skipped.length}`);
  for (const s of skipped) console.log(`   ⚠ ${s}`);

  // ── EduLM students + matcher ──
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
  const normLevel = (s: string) =>
    deburr(s).toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^(term|tle).*/, "terminale");
  const prepared = students.map((st) => ({
    st,
    last: new Set(coreTokens(st.lastName).map(squash)),
    first: squash(normFirst(st.firstName)),
    level: normLevel(st.enrollments[0]?.class.level ?? ""),
  }));
  const firstOk = (a: string, b: string) =>
    a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));

  function findByAlias(a: { first: string; last: string }) {
    const lastT = new Set(coreTokens(a.last).map(squash));
    const firstN = squash(normFirst(a.first));
    return (
      prepared.find(
        (p) =>
          p.last.size === lastT.size &&
          [...p.last].every((t) => lastT.has(t)) &&
          firstOk(p.first, firstN),
      )?.st ??
      prepared.find(
        (p) => [...lastT].every((t) => p.last.has(t)) && firstOk(p.first, firstN),
      )?.st ??
      null
    );
  }

  function match(name: string, classe: string) {
    const rk = rawKey(name);
    if (KNOWN_UNKNOWN.has(rk)) return null;
    const alias = ALIASES[rk];
    if (alias) return findByAlias(alias);
    const tokens = new Set(coreTokens(name).map(squash));
    const lvl = normLevel(classe).replace(/[abcd]$/, ""); // "CM2B" → "cm2"
    let best: (typeof prepared)[number] | null = null;
    let tie = false;
    let bestScore = -1;
    for (const p of prepared) {
      if (p.last.size === 0) continue;
      const inter = [...p.last].filter((t) => tokens.has(t)).length;
      if (inter !== p.last.size) continue;
      const rest = [...tokens].filter((t) => !p.last.has(t));
      if (!rest.some((t) => firstOk(p.first, t))) continue;
      const levelOk = lvl !== "" && p.level === lvl;
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
  type X = {
    matinBus?: string;
    soirBus?: string;
    quartier: string;
    days: string[];
    collegeSoir: boolean;
    tel: string;
  };
  const fromExcel = new Map<string, X>();
  const unmatched = new Map<string, string>();
  for (const r of xrows) {
    const target = match(r.name, r.classe);
    if (!target) {
      unmatched.set(rawKey(r.name), `${r.name} (${r.classe}, Bus ${r.bus})`);
      continue;
    }
    const cur =
      fromExcel.get(target.id) ??
      ({ quartier: r.quartier, days: [], collegeSoir: false, tel: r.tel } as X);
    if (r.matin) cur.matinBus = r.bus;
    if (r.soir) {
      cur.soirBus = r.bus;
      cur.collegeSoir = r.college;
    }
    if (r.days) cur.days.push(r.days.replace(/\s+/g, " ").trim());
    if (!cur.quartier) cur.quartier = r.quartier;
    if (!cur.tel) cur.tel = r.tel;
    fromExcel.set(target.id, cur);
  }
  console.log(`\nÉlèves appariés: ${fromExcel.size} · non trouvés: ${unmatched.size}`);
  for (const u of unmatched.values()) console.log(`   ✗ ${u}`);

  // ── Build updates (MERGE: only students present in the Excel) ──
  const splitQuartier = (q: string): { zone: string; station: string } => {
    const cut = q.search(/[-,]/);
    if (cut < 0) return { zone: q.trim(), station: "" };
    return { zone: q.slice(0, cut).trim(), station: q.slice(cut + 1).replace(/^[-,\s]+/, "").trim() };
  };
  const byId = new Map(students.map((s) => [s.id, s]));
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  for (const [id, x] of fromExcel) {
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
    const prev = periods[PERIOD] ?? {};
    const { zone, station } = splitQuartier(x.quartier);
    const remParts: string[] = [];
    if (x.collegeSoir) remParts.push("Soir: tournée collège");
    if (x.days.length) remParts.push(`Activités: ${[...new Set(x.days)].join(", ")}`);
    const entry: Record<string, string> = {
      as: x.matinBus ? "yes" : "",
      rs: x.soirBus ? "yes" : "",
      car_matin: x.matinBus ?? "",
      zone_matin: x.matinBus ? zone : "",
      station_matin: x.matinBus ? station : "",
      car_soir: x.soirBus ?? "",
      zone_soir: x.soirBus ? zone : "",
      station_soir: x.soirBus ? station : "",
      remarques: remParts.join(" · "),
      tel: prev.tel || x.tel || "",
      ...(prev.montant != null ? { montant: prev.montant } : {}),
      ...(prev.paye != null ? { paye: prev.paye } : {}),
    };
    if (JSON.stringify(prev) === JSON.stringify(entry)) continue;
    periods[PERIOD] = entry;
    ca.bus_periods = JSON.stringify(periods);
    updates.push({
      id,
      ca,
      label: `${st.lastName} ${st.firstName}: ${[entry.as && "AS " + entry.car_matin, entry.rs && "RS " + entry.car_soir].filter(Boolean).join(" + ")}${remParts.length ? " · " + remParts.join(" · ") : ""}`,
    });
  }

  console.log(`\nÀ mettre à jour (fusion): ${updates.length} élèves`);
  for (const u of updates.slice(0, 15)) console.log(`   • ${u.label}`);
  if (updates.length > 15) console.log(`   … +${updates.length - 15}`);

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
  console.log(`✓ Fusion appliquée: ${done} élèves.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
