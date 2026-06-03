import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  if (!t) { console.log("no tenant"); return; }
  const [families, parents, guardians, students, links, enrolled] = await Promise.all([
    p.family.count({ where: { tenantId: t.id, darsRootParentId: { not: null } } }),
    p.user.count({ where: { tenantId: t.id, darsParentId: { not: null } } }),
    p.guardian.count({ where: { tenantId: t.id } }),
    p.student.count({ where: { tenantId: t.id, darsStudentId: { not: null } } }),
    p.studentGuardian.count(),
    p.student.count({ where: { tenantId: t.id, status: "ENROLLED" } }),
  ]);
  console.log(`Imported so far:`);
  console.log(`  Families:  ${families} / 1019`);
  console.log(`  Parents:   ${parents} / 2040`);
  console.log(`  Guardians: ${guardians}`);
  console.log(`  Students:  ${students} / 1806`);
  console.log(`  Links:     ${links} / 3612`);
  console.log(`  ENROLLED:  ${enrolled} / 1084`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
