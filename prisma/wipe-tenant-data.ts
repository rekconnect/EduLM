/**
 * Full reset of a tenant's operational data — wipes everything except
 * the tenant row itself, its admin users, and its configuration
 * (settings, establishments, branding, etc.).
 *
 * Order matters because of FK constraints:
 *   1. Applications + their cascading children  (already cleared if you
 *      ran wipe-cycles.ts first; harmless if zero)
 *   2. Enrollments  (FK to Student + Class + AcademicYear)
 *   3. StudentGuardian links
 *   4. Students
 *   5. Guardians
 *   6. Families (orphaned)
 *   7. ContactMessages  (parents may have sent these — blocks user delete)
 *   8. Parent users  (Account, Session, DocumentAcknowledgment,
 *      AnnouncementRead cascade automatically)
 *   9. Classes
 *  10. Academic years
 *
 * Tenant-scoped. Other schools in the same DB are untouched.
 *
 * Run:
 *   npx tsx prisma/wipe-tenant-data.ts --tenant-name=Montaigne
 *   npx tsx prisma/wipe-tenant-data.ts --tenant-name=Montaigne --confirm
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const isConfirm = process.argv.includes("--confirm");
const TENANT_ARG = process.argv.find((a) => a.startsWith("--tenant="));
const EXPLICIT_TENANT_ID = TENANT_ARG ? TENANT_ARG.split("=")[1] : null;
const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;

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
  } else if (allTenants.length === 1) {
    target = allTenants[0]!;
  } else {
    console.error(
      "Multiple tenants exist — pick one to avoid wiping the wrong school:",
    );
    console.error("  npx tsx prisma/wipe-tenant-data.ts --tenant-name=Montaigne --confirm");
    process.exit(1);
  }
  console.log(`✓ Target tenant: ${target.name} (${target.id})\n`);

  const counts = {
    applications: await prisma.application.count({ where: { tenantId: target.id } }),
    enrollments: await prisma.enrollment.count({ where: { tenantId: target.id } }),
    students: await prisma.student.count({ where: { tenantId: target.id } }),
    guardians: await prisma.guardian.count({ where: { tenantId: target.id } }),
    families: await prisma.family.count({ where: { tenantId: target.id } }),
    contactMessages: await prisma.contactMessage.count({
      where: { tenantId: target.id },
    }),
    parents: await prisma.user.count({
      where: { role: "PARENT", tenantId: target.id },
    }),
    teachers: await prisma.user.count({
      where: { role: "TEACHER", tenantId: target.id },
    }),
    classes: await prisma.class.count({ where: { tenantId: target.id } }),
    years: await prisma.academicYear.count({ where: { tenantId: target.id } }),
  };

  console.log("Counts to wipe:");
  console.log(`  • Applications:    ${counts.applications}`);
  console.log(`  • Enrollments:     ${counts.enrollments}`);
  console.log(`  • Students:        ${counts.students}`);
  console.log(`  • Guardians:       ${counts.guardians}`);
  console.log(`  • Families:        ${counts.families}`);
  console.log(`  • ContactMessages: ${counts.contactMessages}`);
  console.log(`  • PARENT users:    ${counts.parents}`);
  console.log(`  • TEACHER users:   ${counts.teachers}`);
  console.log(`  • Classes:         ${counts.classes}`);
  console.log(`  • Academic years:  ${counts.years}`);
  console.log("");
  console.log("Admin users, tenant config, establishments, and cycles: UNTOUCHED.");
  console.log("");

  if (!isConfirm) {
    console.log("🟡 Dry run. Re-run with --confirm to apply.");
    return;
  }

  console.log("🔴 CONFIRM mode — wiping…\n");
  await prisma.$transaction(
    async (tx) => {
      const a = await tx.application.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ applications:   ${a.count}`);
      const e = await tx.enrollment.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ enrollments:    ${e.count}`);
      const s = await tx.student.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ students:       ${s.count}`);
      const g = await tx.guardian.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ guardians:      ${g.count}`);
      const f = await tx.family.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ families:       ${f.count}`);
      // ContactMessage.fromUser is a required non-cascading FK to User,
      // so any parent who sent a message blocks user.deleteMany. Clear
      // the whole tenant's inbox before deleting parent users.
      const cm = await tx.contactMessage.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ contactMsgs:    ${cm.count}`);
      const u = await tx.user.deleteMany({
        where: { role: "PARENT", tenantId: target.id },
      });
      console.log(`  ↳ parent users:   ${u.count}`);
      // Teachers come from seed-large.ts and are test data. DisciplineEvent
      // rows referencing them were already cascade-deleted via student.
      const teach = await tx.user.deleteMany({
        where: { role: "TEACHER", tenantId: target.id },
      });
      console.log(`  ↳ teacher users:  ${teach.count}`);
      const c = await tx.class.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ classes:        ${c.count}`);
      const y = await tx.academicYear.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ academic years: ${y.count}`);
    },
    { timeout: 120_000 },
  );

  console.log("\n✓ Done. Tenant is back to a clean state.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
