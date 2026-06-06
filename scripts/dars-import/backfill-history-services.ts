/**
 * Per-year service history. For each year (2021-22 .. 2025-26), reads the
 * billing tariffs (Transport / Cantine / Collation) and records, per student,
 * which services they had that year. Stored as a JSON map in
 * customAnswers.services_by_year = { "2021-2022": "Transport, Collation", … }
 * so the fiche's Parcours section can show it.
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const ANNEES = [2022, 2023, 2024, 2025, 2026];

async function serviceSet(code: string, annee: number): Promise<Set<number>> {
  const rows = await darsQuery<{ Id_Eleve: number }>(
    `SELECT DISTINCT et.Id_Eleve
     FROM Fct_Eleve_Tarif et
     JOIN Fct_Tarif_Classe tc ON tc.ID = et.Id_Tarif_Classe
     JOIN Fct_Type_Tarif tt ON tt.ID = tc.Id_Tarif
     JOIN Fct_Factures_Entete fe ON fe.ID = et.ID_Entete
     WHERE et.Id_College=${C} AND fe.Annee=${annee} AND tt.Code='${code}'`,
  );
  return new Set(rows.map((r) => Number(r.Id_Eleve)));
}

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // year → {trans, can, col}
  const byYear = new Map<number, { trans: Set<number>; can: Set<number>; col: Set<number> }>();
  for (const a of ANNEES) {
    const [trans, can, col] = await Promise.all([serviceSet("TRANS", a), serviceSet("CAN", a), serviceSet("COL", a)]);
    byYear.set(a, { trans, can, col });
    console.log(`  ${a - 1}-${a}: transport ${trans.size}, cantine ${can.size}, collation ${col.size}`);
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true, customAnswers: true },
  });

  const build = (did: number): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const a of ANNEES) {
      const sets = byYear.get(a)!;
      const svc: string[] = [];
      if (sets.trans.has(did)) svc.push("Transport");
      if (sets.can.has(did)) svc.push("Cantine");
      if (sets.col.has(did)) svc.push("Collation");
      if (svc.length) out[`${a - 1}-${a}`] = svc.join(", ");
    }
    return out;
  };

  const withServices = students.filter((s) => Object.keys(build(Number(s.darsStudentId))).length > 0).length;
  console.log(`\nStudents with any service history: ${withServices}`);

  if (!confirm) {
    console.log("🟡 DRY RUN — re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const SZ = 5; // safe for connection_limit=1
  for (let i = 0; i < students.length; i += SZ) {
    await Promise.all(
      students.slice(i, i + SZ).map((s) => {
        const map = build(Number(s.darsStudentId));
        const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
        if (Object.keys(map).length) ca.services_by_year = JSON.stringify(map);
        return prisma.student.update({ where: { id: s.id }, data: { customAnswers: ca } });
      }),
    );
    done += Math.min(SZ, students.length - i);
    process.stdout.write(`\r  ${done}/${students.length}`);
  }
  process.stdout.write("\n✓ Per-year service history stored.\n");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
