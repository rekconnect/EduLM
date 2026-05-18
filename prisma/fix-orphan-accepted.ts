/**
 * Find applications marked ACCEPTED whose Student record never got created
 * (resultingStudentId is null AND existingStudentId is null — meaning it
 * wasn't a renewal either). Reset them to SUBMITTED so the admin can
 * re-accept them through the UI cleanly.
 *
 * Run:  npx tsx prisma/fix-orphan-accepted.ts
 *       npx tsx prisma/fix-orphan-accepted.ts --apply   (actually do it)
 */
import { unscopedDb } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const u = unscopedDb();
  const tenant = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true },
  });
  if (!tenant) throw new Error("Seed first");

  const orphans = await u.application.findMany({
    where: {
      tenantId: tenant.id,
      status: "ACCEPTED",
      resultingStudentId: null,
      existingStudentId: null,
    },
    include: {
      cycle: { select: { label: true, targetYearLabel: true } },
      submittedBy: { select: { email: true } },
    },
  });

  console.log(`Found ${orphans.length} orphan ACCEPTED application(s):\n`);
  for (const a of orphans) {
    console.log(
      `  - ${a.childFirstName} ${a.childLastName}  · cycle=${a.cycle.label}  · by=${a.submittedBy.email}`,
    );
  }

  if (orphans.length === 0) {
    console.log("\nNothing to repair.");
    await u.$disconnect();
    return;
  }

  if (!APPLY) {
    console.log(`\nDry run — pass --apply to reset these to SUBMITTED.`);
    await u.$disconnect();
    return;
  }

  for (const a of orphans) {
    await u.application.update({
      where: { id: a.id },
      data: {
        status: "SUBMITTED",
        decisionAt: null,
        decisionNote: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
    });
  }
  console.log(`\n✓ Reset ${orphans.length} application(s) to SUBMITTED — re-accept via /admissions-admin.`);
  await u.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
