import { db, unscopedDb } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenant-context";
import bcrypt from "bcryptjs";

async function main() {
  const u = unscopedDb();
  const t = await u.tenant.findUnique({ where: { slug: "montaigne" }, select: { id: true } });
  const cycle = await u.admissionCycle.findFirst({
    where: { tenantId: t!.id, isActive: true },
    select: { id: true },
  });
  if (!t || !cycle) throw new Error("Seed first");

  // Use an existing parent (Sami already has Layla and Karim → "existing family")
  const sami = await u.user.findFirst({
    where: { email: "sami.kassem@example.com" },
    select: { id: true },
  });
  if (!sami) throw new Error("Sami not seeded");

  // Create a brand-new parent (no guardian/students → "new family")
  const newEmail = `test-bucket-${Date.now()}@example.com`;
  const pwHash = await bcrypt.hash("temppw123", 10);
  const newDad = await u.user.create({
    data: {
      tenantId: t.id,
      email: newEmail,
      name: "Bucket Test",
      passwordHash: pwHash,
      role: "PARENT",
      status: "ACTIVE",
      locale: "fr",
      emailVerified: new Date(),
    },
  });

  // Two test applications, one each.
  const samiApp = await u.application.create({
    data: {
      tenantId: t.id,
      cycleId: cycle.id,
      submittedByUserId: sami.id,
      status: "SUBMITTED",
      submittedAt: new Date(),
      childFirstName: "Petit",
      childLastName: "Kassem",
      primaryParentName: "Sami Kassem",
      requestedLevel: "CP",
    },
    select: { id: true },
  });
  const newApp = await u.application.create({
    data: {
      tenantId: t.id,
      cycleId: cycle.id,
      submittedByUserId: newDad.id,
      status: "SUBMITTED",
      submittedAt: new Date(),
      childFirstName: "Brand",
      childLastName: "New",
      primaryParentName: "Bucket Test",
      requestedLevel: "6ème",
    },
    select: { id: true },
  });

  // Now query the way the admin page does and verify bucketing.
  await runWithTenant({ tenantId: t.id, slug: "montaigne" }, async () => {
    const apps = await db.application.findMany({
      include: {
        submittedBy: {
          select: {
            email: true,
            guardianProfile: {
              select: { childLinks: { select: { studentId: true } } },
            },
          },
        },
      },
    });

    const buckets = { newFamily: 0, existingFamily: 0 };
    for (const a of apps) {
      const cnt = a.submittedBy.guardianProfile?.childLinks.length ?? 0;
      if (cnt > 0) buckets.existingFamily++;
      else buckets.newFamily++;
    }
    console.log(`Total applications: ${apps.length}`);
    console.log(`  New family: ${buckets.newFamily}`);
    console.log(`  Existing family: ${buckets.existingFamily}`);

    // Verify our two test apps are bucketed correctly.
    const samiResult = apps.find((a) => a.id === samiApp.id);
    const newResult = apps.find((a) => a.id === newApp.id);
    const samiCnt = samiResult?.submittedBy.guardianProfile?.childLinks.length ?? 0;
    const newCnt = newResult?.submittedBy.guardianProfile?.childLinks.length ?? 0;
    console.log(`\nSami's app: ${samiCnt} existing kids → ${samiCnt > 0 ? "EXISTING ✓" : "NEW ✗"}`);
    console.log(`New dad's app: ${newCnt} existing kids → ${newCnt === 0 ? "NEW ✓" : "EXISTING ✗"}`);
  });

  // Cleanup.
  await u.application.delete({ where: { id: samiApp.id } });
  await u.application.delete({ where: { id: newApp.id } });
  await u.user.delete({ where: { id: newDad.id } });
  await u.$disconnect();
  console.log("\n✓ cleanup done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
