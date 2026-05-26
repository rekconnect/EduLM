/**
 * Wipe every PARENT user along with everything that hangs off them:
 * applications, students, guardians, families. Admin/teacher accounts
 * are left untouched.
 *
 * Run:
 *   npx tsx prisma/wipe-all-parents.ts             # dry run
 *   npx tsx prisma/wipe-all-parents.ts --confirm   # actually delete
 *
 * Order matters because some tables only cascade one direction.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isConfirm = process.argv.includes("--confirm");
const TENANT_ARG = process.argv.find((a) => a.startsWith("--tenant="));
const EXPLICIT_TENANT_ID = TENANT_ARG ? TENANT_ARG.split("=")[1] : null;
const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;

async function main() {
  // List tenants up-front and resolve target so we never wipe the
  // wrong school in a multi-tenant DB.
  const allTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  if (allTenants.length === 0) {
    console.error("No tenant in DB. Nothing to do.");
    return;
  }
  console.log("Tenants in DB:");
  for (const t of allTenants) {
    console.log(`  • ${t.name}  (${t.slug})  [id: ${t.id}]`);
  }
  console.log("");

  let targetTenantId: string | null = null;
  if (EXPLICIT_TENANT_ID) {
    const found = allTenants.find((x) => x.id === EXPLICIT_TENANT_ID);
    if (!found) {
      console.error(`No tenant with id "${EXPLICIT_TENANT_ID}". Aborting.`);
      process.exit(1);
    }
    targetTenantId = found.id;
  } else if (EXPLICIT_TENANT_NAME) {
    const q = EXPLICIT_TENANT_NAME.toLowerCase();
    const matches = allTenants.filter((x) =>
      x.name.toLowerCase().includes(q),
    );
    if (matches.length !== 1) {
      console.error(
        `Tenant name "${EXPLICIT_TENANT_NAME}" matched ${matches.length} tenants. Refine. Aborting.`,
      );
      process.exit(1);
    }
    targetTenantId = matches[0]!.id;
  } else if (allTenants.length === 1) {
    targetTenantId = allTenants[0]!.id;
  } else {
    console.error(
      "Multiple tenants exist — refusing to wipe without explicit selection:",
    );
    console.error("  npx tsx prisma/wipe-all-parents.ts --tenant-name=Montaigne --confirm");
    console.error("  npx tsx prisma/wipe-all-parents.ts --tenant=<id> --confirm");
    process.exit(1);
  }
  const target = allTenants.find((t) => t.id === targetTenantId)!;
  console.log(`✓ Target tenant: ${target.name} (${target.id})\n`);

  console.log(
    isConfirm
      ? `🔴 CONFIRM mode — every PARENT under "${target.name}" will be deleted.\n`
      : "🟡 Dry run — nothing will be deleted. Re-run with --confirm to apply.\n",
  );

  const [parents, students, applications, guardians, families] =
    await Promise.all([
      prisma.user.count({ where: { role: "PARENT", tenantId: target.id } }),
      prisma.student.count({ where: { tenantId: target.id } }),
      prisma.application.count({ where: { tenantId: target.id } }),
      prisma.guardian.count({ where: { tenantId: target.id } }),
      prisma.family.count({ where: { tenantId: target.id } }),
    ]);

  console.log(`Counts for ${target.name}:`);
  console.log(`  • PARENT users:  ${parents}`);
  console.log(`  • Students:      ${students}`);
  console.log(`  • Applications:  ${applications}`);
  console.log(`  • Guardians:     ${guardians}`);
  console.log(`  • Families:      ${families}`);
  console.log("");

  if (!isConfirm) {
    console.log("Dry run done. Re-run with --confirm to delete.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const a = await tx.application.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ applications: ${a.count}`);
      const s = await tx.student.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ students: ${s.count}`);
      const g = await tx.guardian.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ guardians: ${g.count}`);
      const f = await tx.family.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ families: ${f.count}`);
      const u = await tx.user.deleteMany({
        where: { role: "PARENT", tenantId: target.id },
      });
      console.log(`  ↳ parent users: ${u.count}`);
    },
    { timeout: 60_000 },
  );

  console.log("\n✓ Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
