/**
 * Import the school's authoritative photo-authorization list
 * ("Bilan Autorisation Photo", MAJ Excel) into EduLM.
 *
 * The Excel lists ONLY the exceptions — students with at least one NON among the
 * 4 image rights. School policy is OPT-OUT: every active-year student NOT in the
 * file is yes/yes/yes/yes. Columns map 1:1 to our keys:
 *   Site Internet → auth_site · Livre Souvenir → auth_livre
 *   Réseaux Sociaux → auth_reseaux · Web Radio → auth_radio
 *
 * The admin fiche (StudentYearView) reads auth from registration_by_year[<year>]
 * (it passes no flat fallback), so we write the values into
 * registration_by_year[<active year>] AND the flat customAnswers.<key> (used by
 * edit-mode + other surfaces as the stable-consent fallback). Every other key in
 * customAnswers and every other registration year is preserved.
 *
 * quitter_seul is NOT in this file — left untouched (separate safety consent).
 *
 * Matching: name token-set (order-independent, accent/paren-insensitive) with
 * class (level/section) disambiguation, plus a lastname+class fallback for
 * spelling variants (e.g. Excel "RAFIH MICHAEL" → EduLM "Rafih Mikael").
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 *   npx tsx scripts/dars-import/import-photo-auth-from-xlsx.ts \
 *     --tenant-name="Lycée Montaigne" [--file="<path.xlsx>"] [--year="2025-2026"] [--confirm]
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const DEFAULT_FILE =
  "C:/Users/raede/OneDrive - lycee-montaigne.edu.lb/Desktop/auto photos MAJ 25 sept 2025.xlsx";
const AUTH_KEYS = ["auth_site", "auth_livre", "auth_reseaux", "auth_radio"] as const;
type Vals = Record<(typeof AUTH_KEYS)[number], string>;
const ALL_YES: Vals = { auth_site: "yes", auth_livre: "yes", auth_reseaux: "yes", auth_radio: "yes" };

function cellStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result);
    if ("hyperlink" in v) return String(v.hyperlink);
  }
  return String(v);
}
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[()'.\-]/g, " ")
    .replace(/\b(el|al|de|du|la|le)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokset = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
const shareToken = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));
/** OUI/oui → yes · NON/non → no · blank → yes (opt-out default). */
const yn = (s: string) => {
  const t = s.trim().toLowerCase();
  if (t.startsWith("o")) return "yes";
  if (t.startsWith("n")) return "no";
  return "yes";
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const file = fileArg ? fileArg.slice("--file=".length).replace(/^"|"$/g, "") : DEFAULT_FILE;
  const yearArg = process.argv.find((a) => a.startsWith("--year="));
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const activeYear = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  const YEAR = yearArg ? yearArg.slice("--year=".length).replace(/^"|"$/g, "") : activeYear?.label;
  if (!YEAR) {
    console.error("No active academic year and no --year given.");
    process.exit(1);
  }
  console.log(`Fichier: ${file}`);
  console.log(`Année cible: ${YEAR}`);

  // ── Parse the Excel exceptions ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Sheet2") ?? wb.worksheets[0];
  if (!ws) throw new Error("Aucune feuille exploitable dans le classeur.");
  type Ex = { name: string; lvl: string; sec: string; vals: Vals };
  const exceptions: Ex[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const name = cellStr(ws.getRow(r).getCell(1).value).trim();
    if (!name) continue;
    const cls = cellStr(ws.getRow(r).getCell(2).value).trim();
    const [lvl, sec] = cls.split("/").map((x) => (x || "").trim());
    exceptions.push({
      name,
      lvl: lvl || "",
      sec: sec || "",
      vals: {
        auth_site: yn(cellStr(ws.getRow(r).getCell(3).value)),
        auth_livre: yn(cellStr(ws.getRow(r).getCell(4).value)),
        auth_reseaux: yn(cellStr(ws.getRow(r).getCell(5).value)),
        auth_radio: yn(cellStr(ws.getRow(r).getCell(6).value)),
      },
    });
  }
  console.log(`Exceptions dans le fichier: ${exceptions.length}`);

  // ── EduLM active-year students ──
  const studs = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { isActive: true } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { class: { select: { level: true, section: true } } },
      },
    },
  });
  const idx = studs.map((s) => ({
    s,
    tok: tokset(`${s.firstName} ${s.lastName}`),
    lvl: (s.enrollments[0]?.class.level ?? "").toLowerCase(),
    sec: (s.enrollments[0]?.class.section ?? "").toLowerCase(),
  }));

  // ── Match each exception to exactly one student ──
  const valsByStudent = new Map<string, { vals: Vals; from: string }>();
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const conflicts: string[] = [];
  let deduped = 0;
  for (const ex of exceptions) {
    const et = tokset(ex.name);
    let cands = idx.filter((x) => subset(et, x.tok) && subset(x.tok, et)); // exact set
    if (cands.length !== 1) {
      const sup = idx.filter((x) => subset(et, x.tok) || subset(x.tok, et)); // subset either way
      if (sup.length) cands = sup;
    }
    if (cands.length !== 1 && ex.lvl) {
      // spelling-variant fallback: same class + a shared token → unique
      const byClass = idx.filter(
        (x) =>
          x.lvl === ex.lvl.toLowerCase() &&
          (!ex.sec || x.sec === ex.sec.toLowerCase()) &&
          shareToken(et, x.tok),
      );
      if (byClass.length === 1) cands = byClass;
    }
    if (cands.length === 1) {
      const id = cands[0]!.s.id;
      const label = `${ex.name} [${ex.lvl}/${ex.sec}]`;
      const existing = valsByStudent.get(id);
      if (existing) {
        // same student listed twice in the Excel — OK only if values agree
        const same = AUTH_KEYS.every((k) => existing.vals[k] === ex.vals[k]);
        if (same) deduped++;
        else conflicts.push(`« ${existing.from} » ≠ « ${label} » (même élève, valeurs différentes)`);
      } else {
        valsByStudent.set(id, { vals: ex.vals, from: label });
      }
    } else if (cands.length === 0) {
      unmatched.push(`${ex.name} [${ex.lvl}/${ex.sec}]`);
    } else {
      ambiguous.push(`${ex.name} [${ex.lvl}/${ex.sec}] → ${cands.length}`);
    }
  }
  console.log(
    `Correspondances: ${valsByStudent.size} élèves distincts (${exceptions.length} lignes` +
      `${deduped ? `, ${deduped} doublon(s) identique(s) fusionné(s)` : ""})` +
      `  ·  ambigus: ${ambiguous.length}  ·  non trouvés: ${unmatched.length}  ·  conflits: ${conflicts.length}`,
  );
  ambiguous.forEach((a) => console.log(`  ? ${a}`));
  unmatched.forEach((u) => console.log(`  ! ${u}`));
  conflicts.forEach((c) => console.log(`  ⚔ ${c}`));
  if (unmatched.length || ambiguous.length || conflicts.length) {
    console.error(
      "\n⛔ Exceptions non résolues (non trouvé / ambigu / conflit) — corrigez le fichier ou les noms avant --confirm (sinon un NON serait perdu = défaut OUI).",
    );
    if (confirm) {
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  // ── Build updates: exceptions get their values, everyone else all-yes ──
  let excCount = 0;
  let yesCount = 0;
  const updates: { id: string; ca: Prisma.InputJsonValue }[] = [];
  for (const { s } of idx.map((x) => ({ s: x.s }))) {
    const match = valsByStudent.get(s.id);
    if (match) excCount++;
    else yesCount++;
    const v = match?.vals ?? ALL_YES;

    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    // flat stable consent
    for (const k of AUTH_KEYS) ca[k] = v[k];
    // per-year (active year) so StudentYearView shows it
    let reg: Record<string, Record<string, string>> = {};
    if (typeof ca.registration_by_year === "string") {
      try {
        reg = JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>;
      } catch {
        reg = {};
      }
    }
    reg[YEAR] = { ...(reg[YEAR] ?? {}), ...v };
    ca.registration_by_year = JSON.stringify(reg);
    updates.push({ id: s.id, ca: ca as Prisma.InputJsonValue });
  }

  const nonYes = exceptions.reduce(
    (acc, e) => {
      for (const k of AUTH_KEYS) if (e.vals[k] === "no") acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    { auth_site: 0, auth_livre: 0, auth_reseaux: 0, auth_radio: 0 } as Record<string, number>,
  );
  console.log(
    `\nÉlèves année active: ${idx.length}  ·  avec exception fichier: ${excCount}  ·  défaut OUI×4: ${yesCount}`,
  );
  console.log(`NON par colonne (parmi les exceptions): ${JSON.stringify(nonYes)}`);

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
    await prisma.$disconnect();
    return;
  }
  let done = 0;
  for (const u of updates) {
    await prisma.student.update({ where: { id: u.id }, data: { customAnswers: u.ca } });
    if (++done % 100 === 0) console.log(`  …${done}`);
  }
  console.log(`\n✓ ${done} élèves — autorisations photo appliquées pour ${YEAR}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
