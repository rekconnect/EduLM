/**
 * Read-only sanity check — prints how many of each entity each tenant
 * has. Use to verify wipes actually wiped, or to spot leakage between
 * tenants.
 *
 * Run:  npx tsx prisma/count-everything.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  for (const t of tenants) {
    const [parents, admins, teachers, students, guardians, families, applications, cycles, years, classes, enrollments] =
      await Promise.all([
        prisma.user.count({ where: { tenantId: t.id, role: "PARENT" } }),
        prisma.user.count({ where: { tenantId: t.id, role: "SCHOOL_ADMIN" } }),
        prisma.user.count({ where: { tenantId: t.id, role: "TEACHER" } }),
        prisma.student.count({ where: { tenantId: t.id } }),
        prisma.guardian.count({ where: { tenantId: t.id } }),
        prisma.family.count({ where: { tenantId: t.id } }),
        prisma.application.count({ where: { tenantId: t.id } }),
        prisma.admissionCycle.count({ where: { tenantId: t.id } }),
        prisma.academicYear.count({ where: { tenantId: t.id } }),
        prisma.class.count({ where: { tenantId: t.id } }),
        prisma.enrollment.count({ where: { tenantId: t.id } }),
      ]);
    console.log(`\n${t.name}  (slug: ${t.slug})`);
    console.log(`  Parents:      ${parents}`);
    console.log(`  Admins:       ${admins}`);
    console.log(`  Teachers:     ${teachers}`);
    console.log(`  Students:     ${students}`);
    console.log(`  Guardians:    ${guardians}`);
    console.log(`  Families:     ${families}`);
    console.log(`  Applications: ${applications}`);
    console.log(`  Cycles:       ${cycles}`);
    console.log(`  Years:        ${years}`);
    console.log(`  Classes:      ${classes}`);
    console.log(`  Enrollments:  ${enrollments}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
