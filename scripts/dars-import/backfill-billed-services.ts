/**
 * Re-source the current-year (2025-2026) service flags from BILLING — the
 * accurate operational source (a student charged for Transport/Cantine/
 * Collation uses it), not the sparse registration form. Sets autocar /
 * repas_chaud (cantine) / collations on currently-ENROLLED students.
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const YEAR = 2026; // Annee = 2025-2026 (current)

async function serviceSet(code: string): Promise<Set<number>> {
  const rows = await darsQuery<{ Id_Eleve: number }>(
    `SELECT DISTINCT et.Id_Eleve
     FROM Fct_Eleve_Tarif et
     JOIN Fct_Tarif_Classe tc ON tc.ID = et.Id_Tarif_Classe
     JOIN Fct_Type_Tarif tt ON tt.ID = tc.Id_Tarif
     JOIN Fct_Factures_Entete fe ON fe.ID = et.ID_Entete
     WHERE et.Id_College=${C} AND fe.Annee=${YEAR} AND tt.Code='${code}'`,
  );
  return new Set(rows.map((r) => Number(r.Id_Eleve)));
}

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const [trans, can, col] = await Promise.all([serviceSet("TRANS"), serviceSet("CAN"), serviceSet("COL")]);
  console.log(`Billed (2025-2026): transport ${trans.size}, cantine ${can.size}, collation ${col.size}`);

  // Only currently-enrolled students get the current-year flags.
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null }, status: "ENROLLED" },
    select: { id: true, darsStudentId: true, customAnswers: true },
  });
  console.log(`Enrolled students to flag: ${students.length}`);

  if (!confirm) {
    console.log("🟡 DRY RUN — re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < students.length; i += 10) {
    await Promise.all(
      students.slice(i, i + 10).map((s) => {
        const did = Number(s.darsStudentId);
        const ca = {
          ...((s.customAnswers ?? {}) as Record<string, unknown>),
          autocar: trans.has(did) ? "yes" : "no",
          repas_chaud: can.has(did) ? "yes" : "no",
          collations: col.has(did) ? "yes" : "no",
        };
        return prisma.student.update({ where: { id: s.id }, data: { customAnswers: ca } });
      }),
    );
    done += Math.min(10, students.length - i);
    process.stdout.write(`\r  flagged: ${done}/${students.length}`);
  }
  process.stdout.write("\n✓ Current-year service flags set from billing.\n");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
