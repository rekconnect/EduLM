/**
 * Two-phase update of bus_periods["2025-2026|T3"]:
 *
 *  1. REMOVE the 8 pure activity-return keeps the user asked to drop
 *     (absent from the Dars liste, $0, not billed): Abi Aad Yasmina & Georgio,
 *     Boghos Marianne & Joseph, Hajj Chloé, Sikias Mélanie, Kai Karlie,
 *     Abou Aoun Georges.
 *
 *  2. FLAG activity trajets: a direction (matin/soir) is "activité" when the
 *     student has no matching row on the ORDINARY 2026 circuits in Dars
 *     (Trs_Eleve_Station, non désisté). Sets activite_matin / activite_soir
 *     to "yes"/"" on every assigned student.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

const REMOVE = [
  "abi aad yasmina",
  "abi aad georgio",
  "boghos marianne",
  "boghos joseph",
  "hajj (el) chloé",
  "sikias mélanie",
  "kai karlie",
  "abou aoun georges",
];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const REMOVE_SET = new Set(REMOVE.map(norm));

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  // Ordinary-circuit coverage per student+direction from Dars.
  const st = await darsQuery<{ Id_Eleve: number; Type_Trajet: string }>(
    `SELECT es.Id_Eleve, es.Type_Trajet
     FROM Trs_Eleve_Station es
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=2026
     WHERE es.Id_College=${C} AND es.Flag_Desistement=0`,
  );
  const covered = new Map<number, { matin: boolean; soir: boolean }>();
  for (const r of st) {
    const e = covered.get(r.Id_Eleve) ?? { matin: false, soir: false };
    if (r.Type_Trajet === "AS" || r.Type_Trajet === "AR") e.matin = true;
    if (r.Type_Trajet === "RS" || r.Type_Trajet === "AR") e.soir = true;
    covered.set(r.Id_Eleve, e);
  }
  console.log(`Dars circuits ordinaires 2026: ${covered.size} élèves couverts`);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
  });

  let removed = 0;
  let flaggedStudents = 0;
  let flagFields = 0;
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];

  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    const fullName = norm(`${s.lastName} ${s.firstName}`);

    // Phase 1 — removals.
    if (REMOVE_SET.has(fullName)) {
      delete periods[PERIOD];
      if (Object.keys(periods).length === 0) delete ca.bus_periods;
      else ca.bus_periods = JSON.stringify(periods);
      updates.push({ id: s.id, ca, label: `− ${s.lastName} ${s.firstName} — affectation T3 supprimée` });
      removed++;
      continue;
    }

    // Phase 2 — activity flags.
    const cov = covered.get(Number(s.darsStudentId)) ?? { matin: false, soir: false };
    const wantMatin = p.as === "yes" && !cov.matin ? "yes" : "";
    const wantSoir = p.rs === "yes" && !cov.soir ? "yes" : "";
    if ((p.activite_matin ?? "") !== wantMatin || (p.activite_soir ?? "") !== wantSoir) {
      const notes: string[] = [];
      if (wantMatin) notes.push("AS=activité");
      if (wantSoir) notes.push("RS=activité");
      p.activite_matin = wantMatin;
      p.activite_soir = wantSoir;
      periods[PERIOD] = p;
      ca.bus_periods = JSON.stringify(periods);
      updates.push({
        id: s.id,
        ca,
        label: `~ ${s.lastName} ${s.firstName} — ${notes.length ? notes.join(" · ") : "flags effacés (ordinaire)"}`,
      });
      if (wantMatin || wantSoir) flaggedStudents++;
      flagFields++;
    }
  }

  console.log(`\nSuppressions: ${removed}/8 attendues`);
  for (const u of updates.filter((x) => x.label.startsWith("−"))) console.log(`  ${u.label}`);
  console.log(`\nFlags activité: ${flaggedStudents} élève(s) avec ≥1 trajet d'activité (${flagFields} entrées modifiées)`);
  for (const u of updates.filter((x) => x.label.startsWith("~") && !x.label.endsWith("(ordinaire)")).slice(0, 80)) {
    console.log(`  ${u.label}`);
  }

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    let done = 0;
    for (const u of updates) {
      await prisma.student.update({
        where: { id: u.id },
        data: { customAnswers: u.ca as Prisma.InputJsonValue },
      });
      done++;
      if (done % 50 === 0) console.log(`  …${done}`);
    }
    console.log(`\n✓ ${done} élèves mis à jour.`);
  }

  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
