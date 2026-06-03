import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  if (!t) return;
  const year = await p.academicYear.findFirst({ where: { tenantId: t.id, label: "2025-2026" }, select: { id: true } });
  const [enr, classes, darsClasses] = await Promise.all([
    p.enrollment.count({ where: { tenantId: t.id, academicYearId: year!.id } }),
    p.class.count({ where: { tenantId: t.id, academicYearId: year!.id } }),
    p.class.count({ where: { tenantId: t.id, academicYearId: year!.id, darsClassId: { not: null } } }),
  ]);
  console.log(`2025-2026 enrollments: ${enr} / 1084`);
  console.log(`2025-2026 classes:     ${classes} (was 43 seeded; +4 D = 47 expected)`);
  console.log(`  tagged with darsClassId: ${darsClasses}`);

  // Per-class roster (top to bottom)
  const rows = await p.class.findMany({
    where: { tenantId: t.id, academicYearId: year!.id },
    select: { level: true, section: true, _count: { select: { enrollments: true } } },
    orderBy: [{ level: "asc" }, { section: "asc" }],
  });
  const withStudents = rows.filter((r) => r._count.enrollments > 0);
  console.log(`\nClasses with students: ${withStudents.length}`);
  const total = rows.reduce((a, r) => a + r._count.enrollments, 0);
  console.log(`Sum of enrollments across classes: ${total}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
