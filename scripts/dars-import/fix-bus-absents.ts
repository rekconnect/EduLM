/**
 * Per Raed's decision: students ASSIGNED in bus_periods["2025-2026|T3"] but
 * ABSENT from the BUS MAJ Excel (the school's up-to-date truth) have left the
 * bus → clear their T3 assignment (as/rs/buses/quartiers/stations/remarques),
 * keeping tel/montant/paye for the record. Run sync-dossier-from-bus afterwards
 * to align the fiches (autocar=no, Transport token removed).
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/fix-bus-absents.ts --tenant-name="Lycée Montaigne" \
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
const squash = (t: string) =>
  t
    .replace(/y/g, "i")
    .replace(/sh/g, "ch")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/eh$/g, "e")
    .replace(/(.)\1+/g, "$1");
const rawKey = (s: string) => deburr(s).toLowerCase().replace(/\s+/g, " ").trim();
const looksLikeLevel = (s: string) =>
  /^(ps|ms|gs|cp|ce|cm|6|5|4|3|2nde|2 nde|1ere|1 ere|term|tle)/i.test(deburr(s).trim());

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

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const file = arg("file");

  // Excel rows (names only — we just need WHO is in the file).
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const names: Array<{ name: string; classe: string }> = [];
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
      names.push({ name, classe });
    }
  }

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
  const normLevel = (s: string) => deburr(s).toLowerCase().replace(/[^a-z0-9]/g, "");
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
      prepared.find((p) => [...lastT].every((t) => p.last.has(t)) && firstOk(p.first, firstN))?.st ??
      null
    );
  }
  function match(name: string, classe: string) {
    const alias = ALIASES[rawKey(name)];
    if (alias) return findByAlias(alias);
    const tokens = new Set(coreTokens(name).map(squash));
    const lvl = normLevel(classe).replace(/[abcd]$/, "");
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

  const inExcel = new Set<string>();
  for (const n of names) {
    const t = match(n.name, n.classe);
    if (t) inExcel.add(t.id);
  }
  console.log(`Élèves présents dans l'Excel: ${inExcel.size}`);

  // Absents = assigned this period but not in the Excel → clear assignment.
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  for (const s of students) {
    if (inExcel.has(s.id)) continue;
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    let periods: Record<string, Record<string, string>> = {};
    if (typeof ca.bus_periods === "string") {
      try {
        periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
      } catch {
        continue;
      }
    }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    periods[PERIOD] = {
      // Keep billing facts for the record; clear the assignment itself.
      ...(p.tel ? { tel: p.tel } : {}),
      ...(p.montant != null ? { montant: p.montant } : {}),
      ...(p.paye != null ? { paye: p.paye } : {}),
      as: "",
      rs: "",
      car_matin: "",
      zone_matin: "",
      station_matin: "",
      car_soir: "",
      zone_soir: "",
      station_soir: "",
      remarques: "",
    };
    ca.bus_periods = JSON.stringify(periods);
    updates.push({
      id: s.id,
      ca,
      label: `${s.lastName} ${s.firstName} (était ${p.as === "yes" ? "AS " + (p.car_matin || "?") : ""}${p.as === "yes" && p.rs === "yes" ? "+" : ""}${p.rs === "yes" ? "RS " + (p.car_soir || "?") : ""})`,
    });
  }

  console.log(`\nÀ passer « pas de bus »: ${updates.length}`);
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
  console.log(`✓ ${done} élèves passés « pas de bus ».`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
