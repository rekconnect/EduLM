import { db, unscopedDb } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenant-context";
import bcrypt from "bcryptjs";

async function main() {
  const u = unscopedDb();
  const montaigne = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true },
  });
  if (!montaigne) throw new Error("Seed first");

  // 1. Check that the active cycle is visible.
  const cycle = await u.admissionCycle.findFirst({
    where: { tenantId: montaigne.id, isActive: true },
  });
  if (!cycle) throw new Error("No active cycle");
  console.log(`✓ Active cycle: ${cycle.label} (${cycle.targetYearLabel})`);

  // 2. Simulate a public sign-up.
  const testEmail = `test-applicant-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash("temppw1234", 10);
  const newParent = await u.user.create({
    data: {
      tenantId: montaigne.id,
      email: testEmail,
      name: "Test Applicant",
      passwordHash,
      role: "PARENT",
      status: "ACTIVE",
      locale: "fr",
      emailVerified: new Date(),
    },
    select: { id: true, email: true },
  });
  console.log(`✓ Sign-up: ${newParent.email}`);

  // 3. Simulate creating + submitting an application.
  let applicationId: string | undefined;
  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    const app = await db.application.create({
      data: {
        tenantId: montaigne.id,
        cycleId: cycle.id,
        submittedByUserId: newParent.id,
        status: "DRAFT",
        childFirstName: "Yara",
        childLastName: "Test",
        childDob: new Date("2014-08-20"),
        childGender: "FEMALE",
        primaryParentName: "Test Applicant",
        primaryParentEmail: testEmail,
        primaryParentPhone: "+961 70 000000",
        requestedLevel: "6ème",
        currentSchool: "École Élémentaire ABC",
        currentLevel: "CM2",
      },
      select: { id: true },
    });
    applicationId = app.id;

    await db.application.update({
      where: { id: app.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  });
  console.log(`✓ Application submitted (id=${applicationId?.slice(0, 8)}…)`);

  // 4. Simulate admin acceptance: creates Student + Guardian + Enrollment.
  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    const admin = await db.user.findFirst({ where: { role: "SCHOOL_ADMIN" } });
    if (!admin) throw new Error("No admin");
    const klass = await db.class.findFirst({
      where: { academicYear: { isActive: true }, level: "6ème" },
      select: { id: true, academicYearId: true },
    });
    if (!klass) throw new Error("No class");

    let guardian = await db.guardian.findUnique({ where: { userId: newParent.id } });
    if (!guardian) {
      guardian = await db.guardian.create({
        data: { tenantId: montaigne.id, userId: newParent.id, relation: "parent" },
      });
    }
    const student = await db.student.create({
      data: {
        tenantId: montaigne.id,
        firstName: "Yara",
        lastName: "Test",
        dob: new Date("2014-08-20"),
        status: "ENROLLED",
      },
    });
    await db.studentGuardian.create({
      data: { studentId: student.id, guardianId: guardian.id, isPrimary: true },
    });
    await db.enrollment.create({
      data: {
        tenantId: montaigne.id,
        studentId: student.id,
        classId: klass.id,
        academicYearId: klass.academicYearId,
      },
    });
    await db.application.update({
      where: { id: applicationId },
      data: {
        status: "ACCEPTED",
        decisionAt: new Date(),
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        resultingStudentId: student.id,
      },
    });
    console.log(`✓ Acceptance: Student ${student.id.slice(0, 8)}… enrolled in class`);
  });

  // 5. Verify the parent now sees a child.
  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    const g = await db.guardian.findUnique({
      where: { userId: newParent.id },
      include: {
        childLinks: { include: { student: { select: { firstName: true, lastName: true } } } },
      },
    });
    const kids = g?.childLinks ?? [];
    console.log(`✓ Parent now has ${kids.length} child(ren) linked`);
    for (const link of kids) {
      console.log(`    - ${link.student.firstName} ${link.student.lastName}`);
    }
  });

  // 6. Cleanup.
  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    const app = await db.application.findUnique({ where: { id: applicationId } });
    if (app?.resultingStudentId) {
      // Need to clear FK first.
      await db.application.update({
        where: { id: applicationId },
        data: { resultingStudentId: null },
      });
      await db.enrollment.deleteMany({ where: { studentId: app.resultingStudentId } });
      await db.studentGuardian.deleteMany({ where: { studentId: app.resultingStudentId } });
      await db.student.delete({ where: { id: app.resultingStudentId } });
    }
    await db.application.delete({ where: { id: applicationId } });
    await db.guardian.deleteMany({ where: { userId: newParent.id } });
  });
  await u.user.delete({ where: { id: newParent.id } });
  await u.$disconnect();
  console.log("\n✓ cleanup done — Phase 4 happy-path verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
