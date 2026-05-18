import { unscopedDb } from "../src/lib/db";

async function main() {
  const u = unscopedDb();
  const tenant = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true },
  });
  if (!tenant) throw new Error("Seed first");

  // Find all "Charbel" students (case-insensitive) in this tenant.
  const charbels = await u.student.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { firstName: { contains: "charbel", mode: "insensitive" } },
        { lastName: { contains: "kady", mode: "insensitive" } },
      ],
    },
    include: {
      enrollments: {
        include: {
          academicYear: { select: { label: true } },
          class: { select: { name: true } },
        },
      },
      guardianLinks: {
        include: {
          guardian: { include: { user: { select: { email: true } } } },
        },
      },
    },
  });

  console.log(`Found ${charbels.length} student(s) matching "Charbel"/"Kady":\n`);
  for (const s of charbels) {
    console.log(
      `📋 ${s.firstName} ${s.lastName} (id=${s.id.slice(0, 8)}…, status=${s.status})`,
    );
    console.log(`   DOB: ${s.dob?.toISOString().slice(0, 10) ?? "—"}`);
    console.log(`   Guardians:`);
    for (const g of s.guardianLinks) {
      console.log(`     - ${g.guardian.user.email} (primary=${g.isPrimary})`);
    }
    console.log(`   Enrollments (${s.enrollments.length}):`);
    if (s.enrollments.length === 0) {
      console.log(`     ⚠ NONE — student exists but is not enrolled in any year`);
    }
    for (const e of s.enrollments) {
      console.log(`     - ${e.academicYear.label}: ${e.class.name}`);
    }
    console.log();
  }

  // Also check applications mentioning charbel/kady.
  const apps = await u.application.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { childFirstName: { contains: "charbel", mode: "insensitive" } },
        { childLastName: { contains: "kady", mode: "insensitive" } },
      ],
    },
    include: {
      cycle: { select: { label: true, targetYearLabel: true } },
    },
  });

  console.log(`Found ${apps.length} application(s) matching "Charbel"/"Kady":\n`);
  for (const a of apps) {
    console.log(
      `📑 ${a.childFirstName} ${a.childLastName} (id=${a.id.slice(0, 8)}…) status=${a.status}`,
    );
    console.log(`   Cycle: ${a.cycle.label} → year ${a.cycle.targetYearLabel}`);
    console.log(`   resultingStudentId: ${a.resultingStudentId?.slice(0, 8) ?? "—"}`);
    console.log(`   existingStudentId:  ${a.existingStudentId?.slice(0, 8) ?? "—"}`);
    console.log();
  }

  await u.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
