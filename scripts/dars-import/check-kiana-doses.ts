/**
 * Read-only: FIDAWI Kiana's RAW legacy immunization rows from Dars —
 * per Id_Immunization: dose-row count + descriptions/dates. Her screen shows
 * (in order): DTC/Hib/Polio ×4, Hépatite B ×3, Pneumocoque ×3, ROR ×2,
 * Tuberculose ×1, Varicèlle ×1 — dose counts + dates pin each id to its name.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const st = await prisma.student.findFirst({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Kiana", mode: "insensitive" },
      lastName: { contains: "Fidawi", mode: "insensitive" },
    },
    select: { firstName: true, lastName: true, darsStudentId: true, dob: true },
  });
  if (!st?.darsStudentId) {
    console.error("Kiana not found / no darsStudentId");
    process.exit(1);
  }
  console.log(
    `${st.firstName} ${st.lastName} — Dars ID ${st.darsStudentId} — née ${st.dob?.toISOString().slice(0, 10) ?? "?"}`,
  );
  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT Id_Immunization, IsDone, Description, VaccineMonth, VaccineYear
     FROM Med_Immunizations
     WHERE Id_College=${C} AND Id_Student=${Number(st.darsStudentId)}
     ORDER BY Id_Immunization, VaccineYear, VaccineMonth`,
  );
  const byId = new Map<number, string[]>();
  for (const r of rows) {
    const id = Number(r.Id_Immunization);
    const a = byId.get(id) ?? [];
    a.push(
      `${r.IsDone ? "✓" : "·"} ${r.VaccineMonth ?? "?"}/${r.VaccineYear ?? "?"}${r.Description ? ` (${String(r.Description).trim()})` : ""}`,
    );
    byId.set(id, a);
  }
  for (const [id, doses] of [...byId.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`  id ${id}: ${doses.length} dose(s) → ${doses.join("  |  ")}`);
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
