/**
 * Wipe every admission cycle in a chosen tenant, plus the applications
 * that hang off them (FK cascades to contacts / siblings / answers /
 * documents). Parents, students, guardians, and families are NOT
 * touched.
 *
 * After running, create a fresh cycle through the UI
 * (/admissions-admin/cycles) or let the seed script auto-create one.
 *
 * Tenant-scoped — other schools in the same DB stay untouched.
 *
 * Run:
 *   npx tsx prisma/wipe-cycles.ts --tenant-name=Montaigne            # dry run
 *   npx tsx prisma/wipe-cycles.ts --tenant-name=Montaigne --confirm  # apply
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
      "Multiple tenants exist — pick one explicitly to avoid wiping the wrong school:",
    );
    console.error("  npx tsx prisma/wipe-cycles.ts --tenant-name=Montaigne --confirm");
    process.exit(1);
  }
  console.log(`✓ Target tenant: ${target.name} (${target.id})\n`);

  // List cycles + count what's about to vanish.
  const [cycles, applications] = await Promise.all([
    prisma.admissionCycle.findMany({
      where: { tenantId: target.id },
      orderBy: { openAt: "desc" },
      select: {
        id: true,
        label: true,
        targetYearLabel: true,
        isActive: true,
        _count: { select: { applications: true } },
      },
    }),
    prisma.application.count({ where: { tenantId: target.id } }),
  ]);

  if (cycles.length === 0) {
    console.log("No cycles to wipe. Nothing to do.");
    return;
  }

  console.log(`Cycles in ${target.name} (${cycles.length}):`);
  for (const c of cycles) {
    console.log(
      `  • ${c.label}  (${c.targetYearLabel})  ${c.isActive ? "[active]" : "[inactive]"}  apps: ${c._count.applications}  [id: ${c.id}]`,
    );
  }
  console.log(`\nTotal applications to delete (cascades from cycles): ${applications}`);
  console.log("Parents / students / guardians / families: untouched.\n");

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
      console.log(`  ↳ applications:     ${a.count}`);
      const c = await tx.admissionCycle.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ admission cycles: ${c.count}`);
    },
    { timeout: 60_000 },
  );

  console.log("\n✓ Done. Tenant is now cycle-free.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
