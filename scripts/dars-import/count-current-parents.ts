import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const PLACEHOLDER = "@import.lyceemontaigne.local";

async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  if (!t) return;

  // "Current" parent = guardian with at least one ENROLLED child.
  const currentWhere = {
    tenantId: t.id,
    role: "PARENT" as const,
    darsParentId: { not: null },
    guardianProfile: {
      childLinks: { some: { student: { status: "ENROLLED" as const } } },
    },
  };

  const allImported = await p.user.count({
    where: { tenantId: t.id, role: "PARENT", darsParentId: { not: null } },
  });
  const current = await p.user.count({ where: currentWhere });
  const currentReal = await p.user.count({
    where: { ...currentWhere, NOT: { email: { endsWith: PLACEHOLDER } } },
  });
  const currentPlaceholder = current - currentReal;

  // Historical = imported but NO enrolled child
  const historical = allImported - current;

  // How many distinct current families + enrolled students (sanity)
  const enrolledStudents = await p.student.count({ where: { tenantId: t.id, status: "ENROLLED" } });
  const currentFamilies = await p.family.count({
    where: { tenantId: t.id, students: { some: { status: "ENROLLED" } } },
  });

  console.log("── Sanity ──");
  console.log(`  Enrolled students:        ${enrolledStudents}`);
  console.log(`  Families with an enrolled child: ${currentFamilies}`);
  console.log("");
  console.log("── Parents ──");
  console.log(`  All imported parents:     ${allImported}`);
  console.log(`  CURRENT (≥1 enrolled child): ${current}`);
  console.log(`     • real email:          ${currentReal}`);
  console.log(`     • placeholder email:   ${currentPlaceholder}`);
  console.log(`  Historical (no enrolled child): ${historical}`);

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
