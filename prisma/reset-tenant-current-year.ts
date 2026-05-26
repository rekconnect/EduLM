/**
 * Tenant reset for the current year.
 *
 * Wipes:
 *   - All PARENT users + their guardians + students + families
 *   - All applications + per-app contacts/siblings/answers/documents
 *   - All admission cycles
 * Then creates a single fresh "Inscriptions 2025-2026" active cycle so
 * the seed script has one unambiguous target.
 *
 * Tenant-scoped — only the chosen tenant is touched. Other schools in
 * the same DB stay untouched.
 *
 * Run:
 *   # See what would happen
 *   npx tsx prisma/reset-tenant-current-year.ts --tenant-name=Montaigne
 *   # Actually do it
 *   npx tsx prisma/reset-tenant-current-year.ts --tenant-name=Montaigne --confirm
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const isConfirm = process.argv.includes("--confirm");
const TENANT_ARG = process.argv.find((a) => a.startsWith("--tenant="));
const EXPLICIT_TENANT_ID = TENANT_ARG ? TENANT_ARG.split("=")[1] : null;
const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;

// Override these if you want a different "current year".
const NEW_CYCLE_LABEL = "Inscriptions 2025-2026";
const NEW_CYCLE_YEAR = "2025-2026";
const NEW_CYCLE_OPEN = new Date("2025-09-01");
const NEW_CYCLE_CLOSE = new Date("2026-07-31");
const NEW_CYCLE_SCHOOL_START = new Date("2025-09-15");

async function main() {
  // ── Resolve tenant ──
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
      "Multiple tenants exist — pick one to avoid resetting the wrong school:",
    );
    console.error("  npx tsx prisma/reset-tenant-current-year.ts --tenant-name=Montaigne --confirm");
    process.exit(1);
  }
  console.log(`✓ Target tenant: ${target.name} (${target.id})\n`);

  // ── Show what we'd wipe ──
  const [parents, students, applications, guardians, families, cycles] =
    await Promise.all([
      prisma.user.count({ where: { role: "PARENT", tenantId: target.id } }),
      prisma.student.count({ where: { tenantId: target.id } }),
      prisma.application.count({ where: { tenantId: target.id } }),
      prisma.guardian.count({ where: { tenantId: target.id } }),
      prisma.family.count({ where: { tenantId: target.id } }),
      prisma.admissionCycle.count({ where: { tenantId: target.id } }),
    ]);

  console.log("Counts to wipe:");
  console.log(`  • PARENT users:        ${parents}`);
  console.log(`  • Students:            ${students}`);
  console.log(`  • Applications:        ${applications}`);
  console.log(`  • Guardians:           ${guardians}`);
  console.log(`  • Families:            ${families}`);
  console.log(`  • Admission cycles:    ${cycles}`);
  console.log("");
  console.log(`Will then create: "${NEW_CYCLE_LABEL}" (${NEW_CYCLE_YEAR}, active)`);
  console.log("");

  if (!isConfirm) {
    console.log("🟡 Dry run. Re-run with --confirm to apply.");
    return;
  }

  console.log("🔴 CONFIRM mode — applying changes…\n");

  // ── Wipe + recreate cycle, in one transaction ──
  // Order: applications first (everything FK-cascades from there),
  // then students, guardians, families, parent users, cycles.
  await prisma.$transaction(
    async (tx) => {
      const a = await tx.application.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ applications:     ${a.count}`);
      const s = await tx.student.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ students:         ${s.count}`);
      const g = await tx.guardian.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ guardians:        ${g.count}`);
      const f = await tx.family.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ families:         ${f.count}`);
      const u = await tx.user.deleteMany({
        where: { role: "PARENT", tenantId: target.id },
      });
      console.log(`  ↳ parent users:     ${u.count}`);
      const c = await tx.admissionCycle.deleteMany({
        where: { tenantId: target.id },
      });
      console.log(`  ↳ admission cycles: ${c.count}`);

      const newCycle = await tx.admissionCycle.create({
        data: {
          tenantId: target.id,
          label: NEW_CYCLE_LABEL,
          targetYearLabel: NEW_CYCLE_YEAR,
          openAt: NEW_CYCLE_OPEN,
          closeAt: NEW_CYCLE_CLOSE,
          schoolStartDate: NEW_CYCLE_SCHOOL_START,
          currency: "USD",
          isActive: true,
        },
        select: { id: true, label: true },
      });
      console.log(`  ↳ created cycle:    ${newCycle.label} (${newCycle.id})`);
    },
    { timeout: 60_000 },
  );

  console.log("\n✓ Reset complete.\n");
  console.log("Next step:");
  console.log(
    `  npx tsx prisma/seed-random-families.ts --tenant-name="${target.name}"`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
