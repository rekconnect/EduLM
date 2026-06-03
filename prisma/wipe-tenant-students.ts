/**
 * SELECTIVE wipe — clears a tenant's student/parent/family data while
 * KEEPING classes, academic years, establishments, tenant config, and
 * admin users. Use this right before a Dars import so real data lands
 * in a clean slate without throwing away the structural setup
 * (seeded classes for 2025-26 / 2026-27, brand, inscription config,
 * cycle customization, your admin login).
 *
 * What it DELETES (tenant-scoped):
 *   1. Applications + cascading children
 *   2. Enrollments
 *   3. StudentGuardian links
 *   4. Students
 *   5. Guardians
 *   6. Families
 *   7. ContactMessages (blocks parent-user delete otherwise)
 *   8. PARENT users   (Account/Session/etc. cascade)
 *
 * What it KEEPS:
 *   • Classes + Academic years   (Phase 2 enrollment matches these)
 *   • Establishments             (cascading niveau dropdown)
 *   • Tenant config / branding / inscription config / cycle customization
 *   • Admin (SCHOOL_ADMIN / SUPER_ADMIN) users
 *   • TEACHER users              (keep — not student data)
 *
 * Dry-run by default. Add --confirm to actually delete.
 *
 * Run:
 *   npx tsx prisma/wipe-tenant-students.ts --tenant-name=Montaigne
 *   npx tsx prisma/wipe-tenant-students.ts --tenant-name=Montaigne --confirm
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const isConfirm = process.argv.includes("--confirm");
const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;
const ID_ARG = process.argv.find((a) => a.startsWith("--tenant="));
const EXPLICIT_TENANT_ID = ID_ARG ? ID_ARG.split("=")[1] : null;

async function main() {
  const allTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  if (allTenants.length === 0) {
    console.error("No tenant in DB. Aborting.");
    process.exit(1);
  }
  console.log("Tenants in DB:");
  for (const t of allTenants) {
    console.log(`  • ${t.name}  (${t.slug})  [id: ${t.id}]`);
  }
  console.log("");

  let target: { id: string; name: string } | null = null;
  if (EXPLICIT_TENANT_ID) {
    target = allTenants.find((t) => t.id === EXPLICIT_TENANT_ID) ?? null;
    if (!target) {
      console.error(`No tenant with id "${EXPLICIT_TENANT_ID}". Aborting.`);
      process.exit(1);
    }
  } else if (EXPLICIT_TENANT_NAME) {
    const q = EXPLICIT_TENANT_NAME.toLowerCase();
    const matches = allTenants.filter((t) => t.name.toLowerCase().includes(q));
    if (matches.length !== 1) {
      console.error(
        `Tenant name "${EXPLICIT_TENANT_NAME}" matched ${matches.length} tenants. Refine. Aborting.`,
      );
      process.exit(1);
    }
    target = matches[0]!;
  } else {
    // SAFETY: never auto-pick, even with a single tenant — this is a
    // destructive op and must be explicit.
    console.error(
      "You must name the tenant explicitly to wipe student data:",
    );
    console.error(
      "  npx tsx prisma/wipe-tenant-students.ts --tenant-name=Montaigne --confirm",
    );
    process.exit(1);
  }
  console.log(`✓ Target tenant: ${target.name} (${target.id})\n`);

  const counts = {
    applications: await prisma.application.count({ where: { tenantId: target.id } }),
    enrollments: await prisma.enrollment.count({ where: { tenantId: target.id } }),
    students: await prisma.student.count({ where: { tenantId: target.id } }),
    guardians: await prisma.guardian.count({ where: { tenantId: target.id } }),
    families: await prisma.family.count({ where: { tenantId: target.id } }),
    contactMessages: await prisma.contactMessage.count({ where: { tenantId: target.id } }),
    parents: await prisma.user.count({ where: { role: "PARENT", tenantId: target.id } }),
  };

  // Things we are KEEPING — show them so it's obvious nothing structural dies.
  const keep = {
    classes: await prisma.class.count({ where: { tenantId: target.id } }),
    years: await prisma.academicYear.count({ where: { tenantId: target.id } }),
    establishments: await prisma.establishment.count({ where: { tenantId: target.id } }),
    teachers: await prisma.user.count({ where: { role: "TEACHER", tenantId: target.id } }),
    admins: await prisma.user.count({
      where: { tenantId: target.id, role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] } },
    }),
  };

  console.log("Will DELETE:");
  console.log(`  • Applications:    ${counts.applications}`);
  console.log(`  • Enrollments:     ${counts.enrollments}`);
  console.log(`  • Students:        ${counts.students}`);
  console.log(`  • Guardians:       ${counts.guardians}`);
  console.log(`  • Families:        ${counts.families}`);
  console.log(`  • ContactMessages: ${counts.contactMessages}`);
  console.log(`  • PARENT users:    ${counts.parents}`);
  console.log("");
  console.log("Will KEEP:");
  console.log(`  • Classes:         ${keep.classes}`);
  console.log(`  • Academic years:  ${keep.years}`);
  console.log(`  • Establishments:  ${keep.establishments}`);
  console.log(`  • TEACHER users:   ${keep.teachers}`);
  console.log(`  • Admin users:     ${keep.admins}`);
  console.log(`  • Tenant config / branding / inscription config: UNTOUCHED`);
  console.log("");

  if (!isConfirm) {
    console.log("🟡 Dry run. Re-run with --confirm to apply.");
    return;
  }

  console.log("🔴 CONFIRM mode — wiping student data…\n");
  await prisma.$transaction(
    async (tx) => {
      const a = await tx.application.deleteMany({ where: { tenantId: target.id } });
      console.log(`  ↳ applications:   ${a.count}`);
      const e = await tx.enrollment.deleteMany({ where: { tenantId: target.id } });
      console.log(`  ↳ enrollments:    ${e.count}`);
      const s = await tx.student.deleteMany({ where: { tenantId: target.id } });
      console.log(`  ↳ students:       ${s.count}`);
      const g = await tx.guardian.deleteMany({ where: { tenantId: target.id } });
      console.log(`  ↳ guardians:      ${g.count}`);
      const f = await tx.family.deleteMany({ where: { tenantId: target.id } });
      console.log(`  ↳ families:       ${f.count}`);
      const cm = await tx.contactMessage.deleteMany({ where: { tenantId: target.id } });
      console.log(`  ↳ contactMsgs:    ${cm.count}`);
      const u = await tx.user.deleteMany({
        where: { role: "PARENT", tenantId: target.id },
      });
      console.log(`  ↳ parent users:   ${u.count}`);
    },
    { timeout: 120_000 },
  );

  console.log("\n✓ Done. Student data cleared; structure + config kept.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
