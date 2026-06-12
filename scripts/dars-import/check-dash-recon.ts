/**
 * Read-only reconciliation: reproduce the Dars transport dashboard
 * (507 inscrits / 373 aller / 477 retour / $155,960 net) from the DB,
 * then diff student-by-student with what EduLM stores in
 * bus_periods["2025-2026|T3"].
 *
 * Run:  npx tsx scripts/dars-import/check-dash-recon.ts --tenant-name="Lycée Montaigne"
 *       (with DATABASE_URL pointed at DIRECT_URL)
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";
const YEAR = 2026; // Trs_Circuit.Annee for 2025-2026

type StationRow = {
  Id_Eleve: number;
  Type_Trajet: string;
  Flag_Desistement: boolean;
  Id_Session: number;
  StationID: number;
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // ── Dars: every station row of the year (any session whose circuit is 2026) ──
  const st = await darsQuery<StationRow>(
    `SELECT es.Id_Eleve, es.Type_Trajet, es.Flag_Desistement, es.Id_Session, es.ID AS StationID
     FROM Trs_Eleve_Station es
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=${YEAR}
     WHERE es.Id_College=${C}`,
  );
  const active = st.filter((r) => !r.Flag_Desistement);
  const desisted = st.filter((r) => r.Flag_Desistement);
  const inscrits = new Set(active.map((r) => r.Id_Eleve));
  const aller = new Set(active.filter((r) => r.Type_Trajet === "AR" || r.Type_Trajet === "AS").map((r) => r.Id_Eleve));
  const retour = new Set(active.filter((r) => r.Type_Trajet === "AR" || r.Type_Trajet === "RS").map((r) => r.Id_Eleve));
  console.log(`Dars (toutes sessions ${YEAR}) — rows ${st.length} (désistés ${desisted.length})`);
  console.log(`  inscrits distincts: ${inscrits.size} · aller: ${aller.size} · retour: ${retour.size}`);
  console.log(`  (dashboard attendu: 507 / 373 / 477)`);

  // ── Dars: billing for those station rows, current school year only ──
  const bill = await darsQuery<{ Id_Eleve: number; Montant: number; Net: number; Quand: string; Flag_Desistement: boolean }>(
    `SELECT f.Id_Eleve, f.Montant, f.Net, f.Quand, f.Flag_Desistement
     FROM Fct_Eleve_Tarif f
     JOIN Trs_Eleve_Station es ON es.ID=f.Id_Eleve_Station AND es.Id_College=${C}
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=${YEAR}
     WHERE f.Id_College=${C} AND f.Quand >= '2025-08-01' AND f.Quand < '2026-08-01'`,
  );
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const billActive = bill.filter((b) => !b.Flag_Desistement);
  console.log(`\nFacturation ${YEAR} (Quand 2025-08→2026-08): rows ${bill.length} (désistées ${bill.length - billActive.length})`);
  console.log(`  élèves facturés: ${new Set(billActive.map((b) => b.Id_Eleve)).size}`);
  console.log(`  brut: $${sum(billActive.map((b) => Number(b.Montant) || 0)).toLocaleString("en-US")}`);
  console.log(`  net : $${sum(billActive.map((b) => Number(b.Net) || 0)).toLocaleString("en-US")}`);
  console.log(`  (dashboard attendu: $162,705 brut / $155,960 net)`);

  const darsNetByEleve = new Map<number, number>();
  for (const b of billActive) {
    darsNetByEleve.set(b.Id_Eleve, (darsNetByEleve.get(b.Id_Eleve) ?? 0) + (Number(b.Net) || 0));
  }

  // Names for reporting.
  const ids = [...new Set(st.map((r) => r.Id_Eleve))];
  const names = await darsQuery<{ ID_Student: number; StudentCode: string; FirstName: string; LastName: string }>(
    `SELECT ID_Student, StudentCode, FirstName, LastName FROM Isc_Student
     WHERE Id_College=${C} AND ID_Student IN (${ids.join(",")})`,
  );
  const nameById = new Map(names.map((n) => [Number(n.ID_Student), `${n.LastName} ${n.FirstName} [${n.StudentCode}]`]));

  // ── EduLM side ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
  });
  type Edu = { name: string; as: boolean; rs: boolean; montant: number; net: number };
  const eduByDars = new Map<number, Edu>();
  let eduCount = 0, eduAs = 0, eduRs = 0, eduMontant = 0, eduNet = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { /* ignore */ }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    const m = Number(p.montant) || 0;
    const n = Number(p.net) || m;
    eduCount++;
    if (p.as === "yes") eduAs++;
    if (p.rs === "yes") eduRs++;
    eduMontant += m;
    eduNet += n;
    const did = Number(s.darsStudentId);
    if (did) eduByDars.set(did, { name: `${s.lastName} ${s.firstName}`, as: p.as === "yes", rs: p.rs === "yes", montant: m, net: n });
  }
  console.log(`\nEduLM (${PERIOD}) — inscrits: ${eduCount} · aller: ${eduAs} · retour: ${eduRs}`);
  console.log(`  brut: $${eduMontant.toLocaleString("en-US")} · net: $${eduNet.toLocaleString("en-US")}`);

  // ── Diffs ──
  const missingInEdu = [...inscrits].filter((id) => !eduByDars.has(id));
  console.log(`\n— Dars mais PAS dans EduLM (${missingInEdu.length}) —`);
  for (const id of missingInEdu) {
    const trajets = active.filter((r) => r.Id_Eleve === id).map((r) => `${r.Type_Trajet}@s${r.Id_Session}`).join(", ");
    console.log(`  ${nameById.get(id) ?? `#${id}`} — ${trajets} — net $${darsNetByEleve.get(id) ?? 0}`);
  }

  const extraInEdu = [...eduByDars.keys()].filter((id) => !inscrits.has(id));
  console.log(`\n— EduLM mais PAS dans Dars (${extraInEdu.length}) —`);
  for (const id of extraInEdu) {
    const e = eduByDars.get(id)!;
    console.log(`  ${e.name} — ${e.as ? "AS" : ""}${e.rs ? " RS" : ""} — net EduLM $${e.net}${desisted.some((d) => d.Id_Eleve === id) ? " (DÉSISTÉ côté Dars)" : ""}`);
  }

  // Net mismatches (common students, off by > $1).
  const mismatches: Array<{ name: string; dars: number; edu: number }> = [];
  for (const [id, e] of eduByDars) {
    if (!inscrits.has(id)) continue;
    const dn = darsNetByEleve.get(id) ?? 0;
    if (Math.abs(dn - e.net) > 1) mismatches.push({ name: e.name, dars: dn, edu: e.net });
  }
  mismatches.sort((a, b) => Math.abs(b.dars - b.edu) - Math.abs(a.dars - a.edu));
  console.log(`\n— Net différent Dars vs EduLM (${mismatches.length}) —`);
  for (const m of mismatches.slice(0, 30)) {
    console.log(`  ${m.name}: Dars $${m.dars} vs EduLM $${m.edu} (Δ ${(m.edu - m.dars).toFixed(0)})`);
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
