/**
 * One-off seeder — creates the full class roster for a given academic
 * year on a given tenant. Idempotent: skips classes that already exist
 * by (tenantId, academicYearId, level, section).
 *
 * Structure (Lycée Montaigne, 2026-2027):
 *   • Maternelle → 2nde — 3 sections each (A · B · C)   = 13 levels × 3 = 39
 *   • 1ère, Terminale     — 2 sections each (A · B)     = 2 levels × 2 = 4
 *   Total: 43 classes.
 *
 * Run:
 *   # dry run — show what would be created
 *   npx tsx prisma/seed-classes.ts --tenant-name=Montaigne
 *
 *   # actually create — also creates the year if it doesn't exist yet
 *   npx tsx prisma/seed-classes.ts --tenant-name=Montaigne --confirm
 *
 *   # custom year label
 *   npx tsx prisma/seed-classes.ts --tenant-name=Montaigne --year=2027-2028 --confirm
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────────────

const isConfirm = process.argv.includes("--confirm");
const TENANT_ARG = process.argv.find((a) => a.startsWith("--tenant="));
const EXPLICIT_TENANT_ID = TENANT_ARG ? TENANT_ARG.split("=")[1] : null;
const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;
const YEAR_ARG = process.argv.find((a) => a.startsWith("--year="));
const YEAR_LABEL = YEAR_ARG ? YEAR_ARG.split("=")[1]! : "2026-2027";

// ──────────────────────────────────────────────────────────────────────
// Level + section catalogue
// ──────────────────────────────────────────────────────────────────────
// Edit this block to change the structure. Each entry is
// [level, sectionList]. The level string is exactly what lands in
// Class.level and gets shown to admin in the establishment picker.

const LEVELS: Array<[string, readonly string[]]> = [
  ["PS", ["A", "B", "C"]],
  ["MS", ["A", "B", "C"]],
  ["GS", ["A", "B", "C"]],
  ["CP", ["A", "B", "C"]],
  ["CE1", ["A", "B", "C"]],
  ["CE2", ["A", "B", "C"]],
  ["CM1", ["A", "B", "C"]],
  ["CM2", ["A", "B", "C"]],
  ["6ème", ["A", "B", "C"]],
  ["5ème", ["A", "B", "C"]],
  ["4ème", ["A", "B", "C"]],
  ["3ème", ["A", "B", "C"]],
  ["2nde", ["A", "B", "C"]],
  ["1ère", ["A", "B"]],
  ["Terminale", ["A", "B"]],
];

// ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Resolve tenant ────────────────────────────────────────────────
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
    const matches = allTenants.filter((t) =>
      t.name.toLowerCase().includes(q),
    );
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
      "Multiple tenants exist — pick one to avoid seeding into the wrong school:",
    );
    console.error(
      "  npx tsx prisma/seed-classes.ts --tenant-name=Montaigne --confirm",
    );
    process.exit(1);
  }
  console.log(`✓ Target tenant: ${target.name} (${target.id})\n`);

  // ── Resolve / create academic year ────────────────────────────────
  let year = await prisma.academicYear.findUnique({
    where: { tenantId_label: { tenantId: target.id, label: YEAR_LABEL } },
    select: { id: true, label: true, isActive: true },
  });

  if (!year) {
    if (!isConfirm) {
      console.log(
        `🟡 Year "${YEAR_LABEL}" does not exist. Re-run with --confirm to create it.`,
      );
    } else {
      // Sept 1 → Jul 1 by default. The label format we expect is
      // "YYYY-YYYY"; we extract the years if possible, otherwise fall
      // back to today + 1y so the script doesn't fail silently.
      const m = YEAR_LABEL.match(/^(\d{4})-(\d{4})$/);
      const startYear = m ? Number(m[1]) : new Date().getFullYear();
      const endYear = m ? Number(m[2]) : startYear + 1;
      const created = await prisma.academicYear.create({
        data: {
          tenantId: target.id,
          label: YEAR_LABEL,
          startDate: new Date(`${startYear}-09-01T00:00:00.000Z`),
          endDate: new Date(`${endYear}-07-01T00:00:00.000Z`),
          isActive: false,
        },
        select: { id: true, label: true, isActive: true },
      });
      console.log(
        `✓ Created academic year "${created.label}" (id: ${created.id}, isActive: false).`,
      );
      console.log(
        `  Set it active later via /admin/years if it should drive new enrollments.\n`,
      );
      year = created;
    }
  } else {
    console.log(
      `✓ Found existing year "${year.label}" (id: ${year.id}, isActive: ${year.isActive}).\n`,
    );
  }

  // ── Compute the full target class list ────────────────────────────
  const targetClasses: Array<{ level: string; section: string; name: string }> =
    [];
  for (const [level, sections] of LEVELS) {
    for (const section of sections) {
      targetClasses.push({
        level,
        section,
        name: `${level} ${section}`,
      });
    }
  }

  console.log(`Planned classes: ${targetClasses.length}`);
  console.log("  " + targetClasses.map((c) => c.name).join(" · "));
  console.log("");

  // ── Skip / create per row ─────────────────────────────────────────
  if (!year) {
    console.log("🟡 Dry run only (no year yet). Re-run with --confirm.");
    return;
  }

  if (!isConfirm) {
    // Show how many would be created vs already exist.
    const existing = await prisma.class.findMany({
      where: { tenantId: target.id, academicYearId: year.id },
      select: { level: true, section: true },
    });
    const existingSet = new Set(existing.map((c) => `${c.level}|${c.section}`));
    const toCreate = targetClasses.filter(
      (c) => !existingSet.has(`${c.level}|${c.section}`),
    );
    console.log(`Existing: ${existing.length} · would create: ${toCreate.length}`);
    console.log("🟡 Dry run. Re-run with --confirm to apply.");
    return;
  }

  console.log("🔴 CONFIRM mode — creating classes…\n");
  let created = 0;
  let skipped = 0;
  for (const c of targetClasses) {
    try {
      await prisma.class.create({
        data: {
          tenantId: target.id,
          academicYearId: year.id,
          level: c.level,
          section: c.section,
          name: c.name,
        },
      });
      console.log(`  + ${c.name}`);
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The (tenantId, academicYearId, level, section) unique
      // constraint kicks in for any pre-existing row. Skip it; the
      // script is meant to be safely re-runnable.
      if (msg.includes("Unique constraint failed")) {
        console.log(`  · ${c.name} (already exists)`);
        skipped++;
      } else {
        console.error(`  ✗ ${c.name}: ${msg}`);
        throw e;
      }
    }
  }

  console.log(`\n✓ Done. Created: ${created} · Skipped (already existed): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
