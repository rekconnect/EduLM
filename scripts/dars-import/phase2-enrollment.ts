/**
 * Dars → EduLM  ·  Phase 2: class enrollment (2025-2026)
 *
 * For every CONFIRMED (Registered=1) enrollment in the chosen Dars year,
 * link the (already-imported) student to the matching EduLM class for
 * that academic year, creating the EduLM class on the fly when the
 * section (D/E/…/"--") wasn't seeded.
 *
 * Idempotent — Enrollment is keyed [studentId, academicYearId] (one per
 * year); Class is keyed [tenantId, academicYearId, level, section] and
 * tagged with darsClassId.
 *
 * DRY RUN by default. Pass --confirm to write.
 *
 * Run:
 *   npx tsx scripts/dars-import/phase2-enrollment.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/phase2-enrollment.ts --tenant-name="Lycée Montaigne" --confirm
 *   (optional) --syear=2026   (Dars SYear; 2026 = "2025-2026", the default)
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

// Dars SYear → EduLM AcademicYear.label
const YEAR_LABEL: Record<number, string> = {
  2026: "2025-2026",
  2027: "2026-2027",
};

// Normalize a Dars ClassName into an EduLM `level`.
function normLevel(className: string | null): string {
  let s = (className ?? "").trim().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "2nd": "2nde",
    Term: "Terminale",
    Tle: "Terminale",
    "CM 2": "CM2",
    "CM 1": "CM1",
  };
  return map[s] ?? s;
}

// Normalize a Dars Section into an EduLM `section`. Blank / "--" means
// "not yet assigned" → we use a clear placeholder label.
function normSection(section: string | null): string {
  const s = (section ?? "").trim();
  if (s === "" || s === "--") return "Non assigné";
  return s.toUpperCase();
}

type DEnroll = {
  ID_Student: number;
  ID_Class: number;
  ClassName: string | null;
  Section: string | null;
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const syArg = process.argv.find((a) => a.startsWith("--syear="));
  const syear = syArg ? Number(syArg.split("=")[1]) : 2026;
  const yearLabel = YEAR_LABEL[syear];
  if (!yearLabel) {
    console.error(`Unknown Dars SYear ${syear}. Known: ${Object.keys(YEAR_LABEL).join(", ")}`);
    process.exit(1);
  }

  const tenant = await resolveTenant(prisma, tenantName);
  console.log(`Enrolling Dars SYear ${syear} → EduLM "${yearLabel}"\n`);

  // EduLM academic year
  const year = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, label: yearLabel },
    select: { id: true },
  });
  if (!year) {
    console.error(`No EduLM AcademicYear "${yearLabel}" for this tenant. Aborting.`);
    process.exit(1);
  }

  // 1. Confirmed Dars enrollments for the year, joined with class info
  const rows = await darsQuery<DEnroll>(
    `SELECT sc.ID_Student, sc.ID_Class, c.ClassName, c.Section
     FROM Isc_StudentClass sc
     JOIN Isc_Classes c ON c.ID_Class = sc.ID_Class AND c.Id_College = sc.Id_College
     WHERE sc.Id_College = ${C} AND sc.SYear = ${syear} AND sc.Registered = 1`,
  );
  console.log(`Confirmed Dars enrollments: ${rows.length}`);

  // 2. Map Dars student id → EduLM student id (only imported ones)
  const importedStudents = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true },
  });
  const studentByDars = new Map<number, string>();
  for (const s of importedStudents) studentByDars.set(Number(s.darsStudentId), s.id);

  // 3. Plan: resolve target (level, section) per enrollment; collect unmatched
  type Plan = { studentId: string; level: string; section: string; darsClassId: number };
  const plans: Plan[] = [];
  const missingStudents: number[] = [];
  const classKeys = new Map<string, { level: string; section: string; darsClassId: number }>();
  const sectionTally = new Map<string, number>();

  for (const r of rows) {
    const studentId = studentByDars.get(Number(r.ID_Student));
    if (!studentId) {
      missingStudents.push(Number(r.ID_Student));
      continue;
    }
    const level = normLevel(r.ClassName);
    const section = normSection(r.Section);
    const key = `${level}␟${section}`;
    classKeys.set(key, { level, section, darsClassId: Number(r.ID_Class) });
    sectionTally.set(key, (sectionTally.get(key) ?? 0) + 1);
    plans.push({ studentId, level, section, darsClassId: Number(r.ID_Class) });
  }

  // 4. Which target classes already exist vs must be created?
  const existing = await prisma.class.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
    select: { id: true, level: true, section: true },
  });
  const existingKey = new Set(existing.map((c) => `${c.level}␟${c.section}`));
  const toCreate = [...classKeys.keys()].filter((k) => !existingKey.has(k));

  console.log("\n──────────── PLAN ────────────");
  console.log(`  Enrollments to write:    ${plans.length}`);
  console.log(`  Distinct target classes: ${classKeys.size}`);
  console.log(`  Already in EduLM:        ${classKeys.size - toCreate.length}`);
  console.log(`  Classes to auto-create:  ${toCreate.length}`);
  if (missingStudents.length)
    console.log(`  ⚠ Enrollments skipped (student not imported): ${missingStudents.length}`);
  console.log("──────────────────────────────\n");

  if (toCreate.length) {
    console.log("Classes that will be auto-created:");
    for (const k of toCreate.sort()) {
      const [lvl, sec] = k.split("␟");
      console.log(`  • ${lvl} / ${sec}   (${sectionTally.get(k)} students)`);
    }
    console.log("");
  }

  // Show per-section counts so the roster is auditable
  console.log("Per-class enrollment counts (top 50):");
  const sorted = [...sectionTally.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, n] of sorted.slice(0, 50)) {
    const [lvl, sec] = k.split("␟");
    console.log(`  ${lvl} / ${sec}: ${n}`);
  }
  console.log("");

  if (!confirm) {
    console.log("🟡 DRY RUN — nothing written. Re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  // ── Execute ────────────────────────────────────────────────────────
  console.log("🔴 CONFIRM — writing enrollments…\n");

  // (a) Ensure every target class exists; capture id by key
  const classIdByKey = new Map<string, string>();
  for (const [key, info] of classKeys) {
    const cls = await prisma.class.upsert({
      where: {
        tenantId_academicYearId_level_section: {
          tenantId: tenant.id,
          academicYearId: year.id,
          level: info.level,
          section: info.section,
        },
      },
      update: { darsClassId: info.darsClassId },
      create: {
        tenantId: tenant.id,
        academicYearId: year.id,
        level: info.level,
        section: info.section,
        name: `${info.level} ${info.section}`,
        darsClassId: info.darsClassId,
      },
      select: { id: true },
    });
    classIdByKey.set(key, cls.id);
  }
  console.log(`  classes ready: ${classIdByKey.size}`);

  // (b) Enrollments (chunked)
  let done = 0;
  const size = 10; // safe for connection_limit=1 (chunk 50 times out the pool)
  for (let i = 0; i < plans.length; i += size) {
    const slice = plans.slice(i, i + size);
    await Promise.all(
      slice.map((pl) => {
        const classId = classIdByKey.get(`${pl.level}␟${pl.section}`)!;
        return prisma.enrollment.upsert({
          where: { studentId_academicYearId: { studentId: pl.studentId, academicYearId: year.id } },
          update: { classId },
          create: { tenantId: tenant.id, studentId: pl.studentId, classId, academicYearId: year.id },
        });
      }),
    );
    done += slice.length;
    process.stdout.write(`\r  enrollments: ${done}/${plans.length}`);
  }
  process.stdout.write("\n");

  console.log("\n✓ Phase 2 complete.");
  await closeDars();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nERROR:", e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
