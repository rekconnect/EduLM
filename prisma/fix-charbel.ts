/**
 * One-off cleanup: find the student created by an accepted application but
 * enrolled in a year that doesn't match the cycle's target year, and remove
 * the bad enrollment so they can be re-enrolled into the correct year.
 *
 * Usage: npx tsx prisma/fix-charbel.ts
 */
import { unscopedDb } from "../src/lib/db";

async function main() {
  const u = unscopedDb();
  const tenant = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true },
  });
  if (!tenant) throw new Error("Seed first");

  // Find every ACCEPTED application whose resulting student is enrolled in a
  // year that doesn't match the cycle's target year.
  const apps = await u.application.findMany({
    where: { tenantId: tenant.id, status: "ACCEPTED", resultingStudentId: { not: null } },
    select: {
      id: true,
      childFirstName: true,
      childLastName: true,
      resultingStudentId: true,
      cycle: { select: { targetYearLabel: true } },
    },
  });

  let cleaned = 0;
  for (const app of apps) {
    if (!app.resultingStudentId) continue;
    const enrolls = await u.enrollment.findMany({
      where: { studentId: app.resultingStudentId },
      include: { academicYear: { select: { label: true } } },
    });
    const mismatched = enrolls.filter(
      (e) => e.academicYear.label !== app.cycle.targetYearLabel,
    );
    if (mismatched.length === 0) continue;

    console.log(
      `Found: ${app.childFirstName} ${app.childLastName} — accepted for ${app.cycle.targetYearLabel} but enrolled in:`,
    );
    for (const m of mismatched) {
      console.log(`  - ${m.academicYear.label} (enrollment id=${m.id.slice(0, 8)}…)`);
    }
    for (const m of mismatched) {
      await u.enrollment.delete({ where: { id: m.id } });
      cleaned++;
    }
    console.log(`  ✓ Removed ${mismatched.length} bad enrollment(s)\n`);
  }

  await u.$disconnect();
  console.log(`\nDone — cleaned ${cleaned} bad enrollment(s).`);
  if (cleaned === 0) {
    console.log("(No mismatched enrollments found. You may have already cleaned them.)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
