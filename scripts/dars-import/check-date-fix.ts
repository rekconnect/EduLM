/**
 * Read-only: confirm date_inscription now reflects the ACTIVE year (2025-2026 /
 * SYear 2026), not the latest re-registration. Shows students whose 2026 and
 * 2027 RegisterDates differ, with the Dars dates + the EduLM value.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const d = (v: unknown) =>
  v ? new Date(v as string).toISOString().slice(0, 10) : "—";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // Dars: students with BOTH 2026 and 2027 rows where the dates differ.
  const rows = await darsQuery<{
    ID_Student: number;
    d2026: string | null;
    d2027: string | null;
  }>(
    `SELECT a.ID_Student,
            a.RegisterDate AS d2026,
            b.RegisterDate AS d2027
     FROM (SELECT ID_Student, RegisterDate FROM Isc_StudentClass WHERE Id_College=${C} AND SYear=2026) a
     JOIN (SELECT ID_Student, RegisterDate FROM Isc_StudentClass WHERE Id_College=${C} AND SYear=2027) b
       ON a.ID_Student = b.ID_Student
     WHERE a.RegisterDate <> b.RegisterDate`,
  );
  console.log(`Students whose 2026 vs 2027 RegisterDate differ: ${rows.length}`);

  const sample = rows.slice(0, 8);
  for (const r of sample) {
    const st = await prisma.student.findFirst({
      where: { tenantId: tenant.id, darsStudentId: Number(r.ID_Student) },
      select: { firstName: true, lastName: true, customAnswers: true },
    });
    if (!st) continue;
    const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
    const edulm =
      typeof ca.date_inscription === "string" ? ca.date_inscription : "—";
    const ok = edulm === d(r.d2026) ? "✓" : "✗ (got 2027?)";
    console.log(
      `  ${st.firstName} ${st.lastName}: Dars 2025-2026=${d(r.d2026)} | 2026-2027=${d(r.d2027)} | EduLM=${edulm}  ${ok}`,
    );
  }

  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
