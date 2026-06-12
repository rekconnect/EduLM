/**
 * Make the activity data match the BUS MAJ 9-6-2026 workbook EXACTLY.
 * The "Bus N College" tabs carry the activity tables:
 *   Nom | Prénom | Activité | Jour1 | Jour2 | Jour3
 * 45 rows = 44 students (Sarrouh Jude has 2 activities). The old import only
 * read the first day column — this rebuilds the "Activités" remarque with the
 * activity NAME and ALL days, and flags activite_soir for all 44.
 * Remarque format (the activity bus is a 3rd bus on those days — no
 * "Soir: tournée collège" prefix, per Raed):
 *   "Bus 16 — Chorale (Lundi) · Escrime (Mercredi, Vendredi)"
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

// Transcribed 1:1 from the workbook dump (check-bus-maj-days-raw).
// key = EduLM "last first" (deburred lowercase) → College bus + activities.
const ACTS: Record<string, { bus: string; acts: string }> = {
  // Bus 5 College
  "kahi (el) lily rose": { bus: "5", acts: "Chorale — Lundi" },
  "saliba giovanny": { bus: "5", acts: "Chorale — Lundi" },
  "eid laura": { bus: "5", acts: "Chorale — Lundi" },
  "tohme cherif michel": { bus: "5", acts: "Chorale — Lundi" },
  "harbouk emma marie": { bus: "5", acts: "Karaté Aïkido — Lundi, Mardi" },
  "harbouk peter lucas": { bus: "5", acts: "Karaté Aïkido — Mardi, Vendredi" },
  "bou akl dylan": { bus: "5", acts: "Échecs — Lundi, Jeudi" },
  "kahi (el) george": { bus: "5", acts: "Basketball — Lundi, Vendredi" },
  "eid mathieu": { bus: "5", acts: "Basketball — Lundi" },
  "bajak joseph": { bus: "5", acts: "Basketball — Lundi" },
  "riachi celina": { bus: "5", acts: "Ballet — Jeudi" },
  // Bus 6 College
  "abdel sater sky,maria,christina": { bus: "6", acts: "Chorale — Lundi" },
  "asmar (el) elie": { bus: "6", acts: "Karaté Aïkido — Mardi" },
  "abi haila adriana": { bus: "6", acts: "Dessin — Mercredi" },
  // Bus 7 College
  "chebli celia": { bus: "7", acts: "Chorale — Lundi" },
  "escabasse mila": { bus: "7", acts: "Chorale — Lundi" },
  "mouradikian uma": { bus: "7", acts: "Chorale — Lundi, Jeudi" },
  "wardini lea": { bus: "7", acts: "Chorale — Lundi" },
  // Bus 8 College
  "maalouf kelly": { bus: "8", acts: "Chorale — Lundi" },
  "debs georgia": { bus: "8", acts: "Zumba — Jeudi" },
  "sahyoun giorgio": { bus: "8", acts: "Initiation à la musique — Mardi" },
  "assi jamie": { bus: "8", acts: "Ballet — Jeudi" },
  "sahyoun gloria": { bus: "8", acts: "Zumba — Mardi" },
  // Bus 9 College
  "kaddissy yasma": { bus: "9", acts: "Chorale — Lundi, Jeudi" },
  "khoury (el) axelle": { bus: "9", acts: "Chorale — Lundi" },
  "bakalian mateo": { bus: "9", acts: "Karaté Aïkido — Mardi" },
  "boustani (el) carl": { bus: "9", acts: "Karaté Aïkido — Lundi, Mardi, Mercredi" },
  "yazegi el cecilia": { bus: "9", acts: "Karaté Aïkido — Mardi" },
  "boustani (el) marc": { bus: "9", acts: "Initiation à la musique — Mardi, Jeudi" },
  "fahl (el) yoan": { bus: "9", acts: "Club robotique — Mardi" },
  "bakalian milana": { bus: "9", acts: "Zumba — Mardi" },
  // Bus 12 College
  "attieh clara": { bus: "12", acts: "Ballet — Jeudi" },
  // Bus 14 College
  "karam lila": { bus: "14", acts: "Chorale — Lundi" },
  "hage (el) kaia": { bus: "14", acts: "Chorale — Lundi" },
  "karam cecilia": { bus: "14", acts: "Chorale — Lundi" },
  "fidawi kiana": { bus: "14", acts: "Karaté Aïkido — Mardi" },
  "karam matteo": { bus: "14", acts: "Bricolage — Mercredi" },
  // Bus 15 College
  "tager yasha": { bus: "15", acts: "Chorale — Lundi" },
  "tager yoanna": { bus: "15", acts: "Chorale — Lundi" },
  "rafih mikael": { bus: "15", acts: "Club robotique — Mardi, Vendredi" },
  // Bus 16 College
  "sarrouh jude": { bus: "16", acts: "Chorale — Lundi; Escrime — Mercredi, Vendredi" },
  "harb kaylee": { bus: "16", acts: "Zumba — Jeudi" },
  // Bus 19 College
  "bou anny moon": { bus: "19", acts: "Chorale — Lundi" },
  // Bus 20 College
  "tannoury liam": { bus: "20", acts: "Club robotique — Mardi" },
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(`Fichier: ${Object.keys(ACTS).length} élèves d'activités attendus`);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  const seen = new Set<string>();
  let cleared = 0;

  for (const s of students) {
    const key = norm(`${s.lastName} ${s.firstName}`);
    const act = ACTS[key];
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    if (act) {
      if (seen.has(key)) continue; // duplicate ghost record without assignment can't reach here, but be safe
      seen.add(key);
    }

    const prefix = (p.remarques ?? "")
      .replace(/\s*·?\s*Activités[^]*$/i, "")
      .replace(/^Bus \d+ — [^]*$/i, "")
      .trim();
    // Activity students: remarque IS the 3rd-bus line — no "tournée collège".
    const actsFmt = act
      ? act.acts.split("; ").map((a) => a.replace(/^(.+?) — (.+)$/, "$1 ($2)")).join(" · ")
      : "";
    const want = act ? `Bus ${act.bus} — ${actsFmt}` : prefix;
    const wantFlag = act && p.rs === "yes" ? "yes" : "";

    if ((p.remarques ?? "") === want && (p.activite_soir ?? "") === wantFlag) continue;
    if (!act && (p.activite_soir ?? "") !== "yes" && (p.remarques ?? "") === want) continue;
    if (!act && p.activite_soir !== "yes" && /Activités/i.test(p.remarques ?? "") === false) continue;

    if (!act) cleared++;
    p.remarques = want;
    p.activite_soir = wantFlag;
    periods[PERIOD] = p;
    ca.bus_periods = JSON.stringify(periods);
    updates.push({
      id: s.id,
      ca,
      label: `${s.lastName} ${s.firstName} — ${act ? `"${want.slice(0, 90)}"` : "flag/segment activités retiré (absent du fichier)"}`,
    });
  }

  const missing = Object.keys(ACTS).filter((k) => !seen.has(k));
  if (missing.length) {
    console.log(`\n✗ Introuvables/sans affectation (${missing.length}):`);
    for (const m of missing) console.log(`  ${m}`);
  }
  console.log(`\n${updates.length} élèves à modifier (${cleared} flag(s) hors-fichier retirés):`);
  for (const u of updates) console.log(`  ~ ${u.label}`);

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
