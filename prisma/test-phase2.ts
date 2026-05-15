import { db, unscopedDb } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenant-context";

async function main() {
  const u = unscopedDb();
  const montaigne = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true, name: true },
  });
  const reporter = await u.user.findFirst({
    where: { tenantId: montaigne!.id, role: "TEACHER" },
    select: { id: true, name: true, email: true },
  });
  await u.$disconnect();
  if (!montaigne || !reporter) throw new Error("Seed first");

  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    // Pick a student.
    const student = await db.student.findFirst({
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) throw new Error("No students");

    // Insert an absence for today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await db.attendanceRecord.upsert({
      where: { studentId_date: { studentId: student.id, date: today } },
      update: { status: "ABSENT", note: "test-phase2" },
      create: { studentId: student.id, date: today, status: "ABSENT", note: "test-phase2" },
    });

    // Insert a discipline event.
    const event = await db.disciplineEvent.create({
      data: {
        studentId: student.id,
        type: "Bavardage en classe",
        severity: "WARNING",
        description: "Avertissement test depuis test-phase2",
        date: today,
        reportedById: reporter.id,
      },
      select: { id: true, type: true, severity: true },
    });

    // Verify the dashboard-style aggregations.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);
    since.setUTCHours(0, 0, 0, 0);

    const absences = await db.attendanceRecord.count({
      where: { date: { gte: since }, status: "ABSENT" },
    });
    const incidents = await db.disciplineEvent.count({
      where: { date: { gte: since } },
    });
    const studentAbsences = await db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: student.id, date: { gte: since } },
      _count: { status: true },
    });

    console.log(`Tenant: ${montaigne.name}`);
    console.log(`Test student: ${student.lastName} ${student.firstName}`);
    console.log("---");
    console.log(`Absences (7d):  ${absences}`);
    console.log(`Incidents (7d): ${incidents}`);
    console.log(`Student attendance breakdown (7d):`);
    for (const row of studentAbsences) {
      console.log(`  ${row.status}: ${row._count.status}`);
    }
    console.log(`Latest discipline event: ${event.type} [${event.severity}]`);

    // Cleanup test data.
    await db.disciplineEvent.delete({ where: { id: event.id } });
    await db.attendanceRecord.deleteMany({
      where: { studentId: student.id, date: today, note: "test-phase2" },
    });
    console.log("\n✓ cleanup done");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
