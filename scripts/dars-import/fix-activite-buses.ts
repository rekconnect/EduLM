/**
 * Fix the activity students' evening buses (source: BUS MAJ workbook tabs —
 * activity rows live on the "Bus N College" sheets):
 *   1. Repair car_soir for the 3 students whose normal-tour bus was
 *      overwritten by the activity bus (Escabasse 7→19, Harbouk Emma 5→14,
 *      Harbouk Peter 5→14 — target = Dars RS circuit).
 *   2. Annotate every "Activités: <jours>" remarque with the activity bus:
 *      "Activités: Lundi (bus 5)".
 *   3. Add the 3 activity students missed by the original import's matcher:
 *      Sahyoun Giorgio (Mardi bus 8), Rafih Mikael (Mardi bus 15),
 *      Dibs Georgia (Jeudi bus 8).
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

// EduLM "Last First" → activity bus (College run) from the workbook tabs.
const ACT_BUS: Record<string, string> = {
  "abdel sater sky,maria,christina": "6",
  "abi haila adriana": "6",
  "bajak joseph": "5",
  "bou anny moon": "19",
  "boustani (el) carl": "9",
  "yazegi el cecilia": "9",
  "riachi celina": "5",
  "attieh clara": "12",
  "bou akl dylan": "5",
  "eid laura": "5",
  "asmar (el) elie": "6",
  "escabasse mila": "7",
  "fidawi kiana": "14",
  "kahi (el) george": "5",
  "sahyoun gloria": "8",
  "hage (el) kaia": "14",
  "harbouk emma marie": "5",
  "harbouk peter lucas": "5",
  "assi jamie": "8",
  "kaddissy yasma": "9",
  "kahi (el) lily rose": "5",
  "karam lila": "14",
  "harb kaylee": "16",
  "khoury (el) axelle": "9",
  "tannoury liam": "20",
  "maalouf kelly": "8",
  "boustani (el) marc": "9",
  "bakalian mateo": "9",
  "eid mathieu": "5",
  "karam matteo": "14",
  "bakalian milana": "9",
  "mouradikian uma": "7",
  "saliba giovanny": "5",
  "sarrouh jude": "16",
  "tager yasha": "15",
  "tager yoanna": "15",
  "tohme cherif michel": "5",
  "wardini lea": "7",
  "fahl (el) yoan": "9",
};
// car_soir repairs: stored activity bus → real tour bus (= Dars RS circuit).
const CAR_FIX: Record<string, { from: string; to: string }> = {
  "escabasse mila": { from: "7", to: "19" },
  "harbouk emma marie": { from: "5", to: "14" },
  "harbouk peter lucas": { from: "5", to: "14" },
};
// Activity students the original import missed (spelling) → flag + remarque.
const ADD_ACT: Record<string, { bus: string; days: string }> = {
  "sahyoun giorgio": { bus: "8", days: "Mardi" },
  "rafih mikael": { bus: "15", days: "Mardi" },
  "debs georgia": { bus: "8", days: "Jeudi" }, // workbook spells her "Georgia DIBS"
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  const seen = new Set<string>();

  for (const s of students) {
    const key = norm(`${s.lastName} ${s.firstName}`);
    const actBus = ACT_BUS[key];
    const carFix = CAR_FIX[key];
    const addAct = ADD_ACT[key];
    if (!actBus && !carFix && !addAct) continue;
    seen.add(key);

    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    let periods: Record<string, Record<string, string>> = {};
    if (typeof ca.bus_periods === "string") {
      try {
        periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
      } catch { /* ignore */ }
    }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) {
      console.log(`  ⚠ ${s.lastName} ${s.firstName}: pas d'affectation T3 — ignoré`);
      continue;
    }
    const notes: string[] = [];

    if (carFix && p.car_soir === carFix.from) {
      p.car_soir = carFix.to;
      notes.push(`car_soir ${carFix.from} → ${carFix.to}`);
    }

    const bus = actBus ?? addAct?.bus;
    if (bus) {
      const rem = p.remarques ?? "";
      if (/Activités\s*:/i.test(rem)) {
        if (!/\(bus /i.test(rem)) {
          p.remarques = rem.replace(/(Activités\s*:\s*[^·]+?)\s*$/i, `$1 (bus ${bus})`);
          notes.push(`remarque + bus activité ${bus}`);
        }
      } else if (addAct) {
        p.remarques = [rem, `Activités: ${addAct.days} (bus ${bus})`].filter(Boolean).join(" · ");
        notes.push(`remarque "Activités: ${addAct.days} (bus ${bus})" ajoutée`);
      }
      if (p.rs === "yes" && p.activite_soir !== "yes") {
        p.activite_soir = "yes";
        notes.push("flag activité");
      }
    }

    if (notes.length) {
      periods[PERIOD] = p;
      ca.bus_periods = JSON.stringify(periods);
      updates.push({ id: s.id, ca, label: `${s.lastName} ${s.firstName} — ${notes.join(" · ")}` });
    }
  }

  for (const key of [...Object.keys(ACT_BUS), ...Object.keys(CAR_FIX), ...Object.keys(ADD_ACT)]) {
    if (!seen.has(key)) console.log(`  ✗ introuvable dans EduLM: "${key}"`);
  }

  console.log(`\n${updates.length} élèves à modifier:`);
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
