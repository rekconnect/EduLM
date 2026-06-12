/**
 * Read-only: reproduce the Dars dashboard exactly (per VERSEMENT), then diff
 * the matching versement's population vs EduLM bus_periods["2025-2026|T3"].
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // Transport billing rows of 2025-2026 by versement.
  const perVers = await darsQuery<Record<string, unknown>>(
    `SELECT fe.ID_Versement, v.Description AS vers, COUNT(*) AS rows,
            COUNT(DISTINCT f.Id_Eleve) AS eleves,
            SUM(f.Montant) AS montant, SUM(f.Net) AS net
     FROM Fct_Eleve_Tarif f
     JOIN Fct_Factures_Entete fe ON fe.ID = f.ID_Entete AND fe.Id_College=${C}
     LEFT JOIN Fct_Versement v ON v.ID = fe.ID_Versement
     JOIN Trs_Eleve_Station es ON es.ID = f.Id_Eleve_Station AND es.Id_College=${C}
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID = es.Id_Circuit AND c.Annee=2026
     WHERE f.Id_College=${C} AND f.Quand >= '2025-08-01'
     GROUP BY fe.ID_Versement, v.Description ORDER BY fe.ID_Versement`,
  ).catch(async (e) => {
    console.log("(Fct_Versement.Description indisponible: " + String(e).slice(0, 120) + ")");
    return darsQuery<Record<string, unknown>>(
      `SELECT fe.ID_Versement, COUNT(*) AS rows, COUNT(DISTINCT f.Id_Eleve) AS eleves,
              SUM(f.Montant) AS montant, SUM(f.Net) AS net
       FROM Fct_Eleve_Tarif f
       JOIN Fct_Factures_Entete fe ON fe.ID = f.ID_Entete AND fe.Id_College=${C}
       JOIN Trs_Eleve_Station es ON es.ID = f.Id_Eleve_Station AND es.Id_College=${C}
       JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID = es.Id_Circuit AND c.Annee=2026
       WHERE f.Id_College=${C} AND f.Quand >= '2025-08-01'
       GROUP BY fe.ID_Versement ORDER BY fe.ID_Versement`,
    );
  });
  console.log("=== Transport 2025-2026 par versement ===");
  console.table(perVers);

  // The dashboard versement = the one whose net ≈ 155,960.
  const target = perVers.reduce((best, v) =>
    Math.abs(Number(v.net) - 155960) < Math.abs(Number(best.net) - 155960) ? v : best,
  );
  const VID = Number(target.ID_Versement);
  console.log(`\nVersement retenu: ${VID} (net $${Number(target.net).toLocaleString("en-US")})`);

  // Per-student rows for that versement (with trajet info).
  const rows = await darsQuery<{
    Id_Eleve: number; Montant: number; Net: number; Type_Trajet: string; Desist: boolean;
  }>(
    `SELECT f.Id_Eleve, f.Montant, f.Net, es.Type_Trajet, es.Flag_Desistement AS Desist
     FROM Fct_Eleve_Tarif f
     JOIN Fct_Factures_Entete fe ON fe.ID = f.ID_Entete AND fe.Id_College=${C} AND fe.ID_Versement=${VID}
     JOIN Trs_Eleve_Station es ON es.ID = f.Id_Eleve_Station AND es.Id_College=${C}
     WHERE f.Id_College=${C}`,
  );
  const byEleve = new Map<number, { montant: number; net: number; aller: boolean; retour: boolean }>();
  for (const r of rows) {
    const e = byEleve.get(r.Id_Eleve) ?? { montant: 0, net: 0, aller: false, retour: false };
    e.montant += Number(r.Montant) || 0;
    e.net += Number(r.Net) || 0;
    if (r.Type_Trajet === "AR" || r.Type_Trajet === "AS") e.aller = true;
    if (r.Type_Trajet === "AR" || r.Type_Trajet === "RS") e.retour = true;
    byEleve.set(r.Id_Eleve, e);
  }
  const tot = [...byEleve.values()];
  console.log(`Élèves: ${byEleve.size} · aller: ${tot.filter((e) => e.aller).length} · retour: ${tot.filter((e) => e.retour).length}`);
  console.log(`Brut: $${tot.reduce((a, e) => a + e.montant, 0).toLocaleString("en-US")} · Net: $${tot.reduce((a, e) => a + e.net, 0).toLocaleString("en-US")}`);
  console.log(`(dashboard: 507 / 373 / 477 · $162,705 / $155,960)`);

  // Names.
  const ids = [...byEleve.keys()];
  const names = await darsQuery<{ ID_Student: number; StudentCode: string; FirstName: string; LastName: string }>(
    `SELECT ID_Student, StudentCode, FirstName, LastName FROM Isc_Student
     WHERE Id_College=${C} AND ID_Student IN (${ids.join(",")})`,
  );
  const nameById = new Map(names.map((n) => [Number(n.ID_Student), `${n.LastName} ${n.FirstName} [${n.StudentCode ?? "?"}]`]));

  // EduLM side.
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
  });
  type Edu = { name: string; as: boolean; rs: boolean; montant: number; net: number };
  const eduByDars = new Map<number, Edu>();
  let eduNoDars = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { /* ignore */ }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    const did = Number(s.darsStudentId);
    const e: Edu = {
      name: `${s.lastName} ${s.firstName}`,
      as: p.as === "yes", rs: p.rs === "yes",
      montant: Number(p.montant) || 0,
      net: Number(p.net) || Number(p.montant) || 0,
    };
    if (did) eduByDars.set(did, e);
    else eduNoDars++;
  }
  console.log(`\nEduLM: ${eduByDars.size + eduNoDars} affectés (${eduNoDars} sans darsStudentId)`);

  const missing = ids.filter((id) => !eduByDars.has(id));
  console.log(`\n— Facturés versement ${VID} mais PAS affectés dans EduLM (${missing.length}) —`);
  let missNet = 0;
  for (const id of missing) {
    const d = byEleve.get(id)!;
    missNet += d.net;
    console.log(`  ${nameById.get(id) ?? `#${id}`} — ${d.aller ? "aller " : ""}${d.retour ? "retour" : ""} — net $${d.net}`);
  }
  console.log(`  (somme nets manquants: $${missNet.toLocaleString("en-US")})`);

  const extra = [...eduByDars.entries()].filter(([id]) => !byEleve.has(id));
  console.log(`\n— Affectés EduLM mais PAS facturés versement ${VID} (${extra.length}) —`);
  let extraNet = 0;
  for (const [, e] of extra) {
    extraNet += e.net;
    console.log(`  ${e.name} — ${e.as ? "AS" : ""}${e.rs ? " RS" : ""} — net EduLM $${e.net}`);
  }
  console.log(`  (somme nets en trop: $${extraNet.toLocaleString("en-US")})`);

  const mism: Array<{ n: string; d: number; e: number }> = [];
  for (const [id, e] of eduByDars) {
    const d = byEleve.get(id);
    if (!d) continue;
    if (Math.abs(d.net - e.net) > 1) mism.push({ n: e.name, d: d.net, e: e.net });
  }
  mism.sort((a, b) => Math.abs(b.d - b.e) - Math.abs(a.d - a.e));
  console.log(`\n— Net différent (versement ${VID} vs EduLM) (${mism.length}) —`);
  for (const m of mism) console.log(`  ${m.n}: Dars $${m.d} vs EduLM $${m.e} (Δ ${(m.e - m.d).toFixed(0)})`);

  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
