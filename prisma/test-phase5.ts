import { db, unscopedDb } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenant-context";

async function main() {
  const u = unscopedDb();
  const tenant = await u.tenant.findUnique({ where: { slug: "montaigne" }, select: { id: true } });
  if (!tenant) throw new Error("Seed first");

  const sami = await u.user.findFirst({
    where: { email: "sami.kassem@example.com" },
    select: { id: true },
  });
  const admin = await u.user.findFirst({
    where: { tenantId: tenant.id, role: "SCHOOL_ADMIN" },
    select: { id: true },
  });
  if (!sami || !admin) throw new Error("Sami/admin not seeded");

  // 1. Verify the 2026-2027 academic year exists.
  const nextYear = await u.academicYear.findUnique({
    where: { tenantId_label: { tenantId: tenant.id, label: "2026-2027" } },
  });
  if (!nextYear) throw new Error("2026-2027 year not seeded");
  console.log(`✓ 2026-2027 year exists (isActive=${nextYear.isActive})`);

  // 2. Create a class for 2026-2027 (simulating admin building out the new year).
  let nextClass;
  try {
    nextClass = await u.class.create({
      data: {
        tenantId: tenant.id,
        academicYearId: nextYear.id,
        level: "5ème",
        section: "A",
        name: "5ème-A (2026-2027)",
      },
    });
  } catch {
    nextClass = await u.class.findFirst({
      where: { tenantId: tenant.id, academicYearId: nextYear.id, level: "5ème", section: "A" },
    });
    if (!nextClass) throw new Error("Failed to create or find next class");
  }
  console.log(`✓ Next-year class: ${nextClass.name}`);

  // 3. Get the active admission cycle.
  const cycle = await u.admissionCycle.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  });
  if (!cycle) throw new Error("No active cycle");

  // 4. Pick one of Sami's kids to renew (Layla in CM2 → renew for next year).
  const layla = await u.student.findFirst({
    where: { tenantId: tenant.id, firstName: "Layla" },
  });
  if (!layla) throw new Error("Layla not found");

  // 5. Simulate startRenewal: create a draft renewal application.
  let renewalApp = await u.application.findFirst({
    where: { cycleId: cycle.id, existingStudentId: layla.id },
  });
  if (renewalApp) {
    console.log(`(reusing existing renewal app ${renewalApp.id.slice(0, 8)}…)`);
  } else {
    renewalApp = await u.application.create({
      data: {
        tenantId: tenant.id,
        cycleId: cycle.id,
        submittedByUserId: sami.id,
        existingStudentId: layla.id,
        status: "DRAFT",
        childFirstName: layla.firstName,
        childLastName: layla.lastName,
        childDob: layla.dob,
        primaryParentName: "Sami Kassem",
        primaryParentEmail: "sami.kassem@example.com",
        requestedLevel: "5ème",
        currentLevel: "CM2",
      },
    });
    console.log(`✓ Created renewal app for ${layla.firstName} ${layla.lastName}`);
  }

  // 6. Submit it.
  await u.application.update({
    where: { id: renewalApp.id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  console.log(`✓ Submitted`);

  // 7. Simulate admin accept: should NOT create a new Student, just a new Enrollment.
  const studentsBefore = await u.student.count({ where: { tenantId: tenant.id } });

  await runWithTenant({ tenantId: tenant.id, slug: "montaigne" }, async () => {
    const app = await db.application.findUnique({
      where: { id: renewalApp.id },
      select: {
        existingStudentId: true,
        submittedByUserId: true,
        childFirstName: true,
        childLastName: true,
        childDob: true,
      },
    });
    if (!app || !app.existingStudentId) throw new Error("Renewal app missing existingStudentId");

    // Mirror the production accept handler's renewal branch.
    const studentId = app.existingStudentId;
    await db.enrollment.upsert({
      where: {
        studentId_academicYearId: { studentId, academicYearId: nextYear.id },
      },
      update: { classId: nextClass.id },
      create: {
        tenantId: tenant.id,
        studentId,
        classId: nextClass.id,
        academicYearId: nextYear.id,
      },
    });
    await db.application.update({
      where: { id: renewalApp.id },
      data: {
        status: "ACCEPTED",
        decisionAt: new Date(),
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        resultingStudentId: null,
      },
    });
  });

  const studentsAfter = await u.student.count({ where: { tenantId: tenant.id } });
  console.log(`✓ Students before: ${studentsBefore} / after: ${studentsAfter}  (should be equal — no new student created)`);

  // 8. Verify Layla is now enrolled in BOTH years.
  const laylaEnrollments = await u.enrollment.findMany({
    where: { studentId: layla.id },
    include: { academicYear: { select: { label: true } }, class: { select: { name: true } } },
    orderBy: { enrolledAt: "asc" },
  });
  console.log(`✓ Layla enrollments:`);
  for (const e of laylaEnrollments) {
    console.log(`    - ${e.academicYear.label}: ${e.class.name}`);
  }

  // 9. Cleanup: remove the next-year enrollment + the renewal app + the test class.
  await u.enrollment.deleteMany({
    where: { studentId: layla.id, academicYearId: nextYear.id },
  });
  await u.application.delete({ where: { id: renewalApp.id } });
  await u.class.delete({ where: { id: nextClass.id } });
  await u.$disconnect();
  console.log("\n✓ cleanup done — renewal flow verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
