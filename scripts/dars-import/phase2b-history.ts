/**
 * Historical enrollment import — last 5 years (SYear 2022..2026, i.e.
 * academic years 2021-22 .. 2025-26). Creates the past academic years +
 * their classes + each student's enrollment per year, so the fiche can show
 * a full parcours scolaire. 2025-26 already exists (current) and is skipped.
 *
 * Idempotent. DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/phase2b-history.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/phase2b-history.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const SYEARS = [2022, 2023, 2024, 2025]; // 2025-26 (2026) already imported

function normLevel(n: string | null): string {
  let s = (n ?? "").trim().replace(/\s+/g, " ");
  const m: Record<string, string> = { "2nd": "2nde", Term: "Terminale", Tle: "Terminale", "CM 2": "CM2", "CM 1": "CM1" };
  return m[s] ?? s;
}
function normSection(s: string | null): string {
  const v = (s ?? "").trim();
  return v === "" || v === "--" ? "Non assigné" : v.toUpperCase();
}

type DEnroll = { ID_Student: number; ID_Class: number; ClassName: string | null; Section: string | null };

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;

  const eduStudents = await prisma.student.findMany({
    where: { tenantId: T, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true },
  });
  const studentByDars = new Map(eduStudents.map((s) => [Number(s.darsStudentId), s.id]));

  let totalEnroll = 0, totalClasses = 0;
  for (const sy of SYEARS) {
    const label = `${sy - 1}-${sy}`;
    const rows = await darsQuery<DEnroll>(
      `SELECT sc.ID_Student, sc.ID_Class, c.ClassName, c.Section
       FROM Isc_StudentClass sc JOIN Isc_Classes c ON c.ID_Class = sc.ID_Class AND c.Id_College = sc.Id_College
       WHERE sc.Id_College=${C} AND sc.SYear=${sy} AND sc.Registered=1`,
    );
    const plans = rows
      .map((r) => ({ studentId: studentByDars.get(Number(r.ID_Student)), level: normLevel(r.ClassName), section: normSection(r.Section), darsClassId: Number(r.ID_Class) }))
      .filter((p) => p.studentId);
    const classKeys = new Map<string, { level: string; section: string; darsClassId: number }>();
    for (const p of plans) classKeys.set(`${p.level}␟${p.section}`, { level: p.level, section: p.section, darsClassId: p.darsClassId });

    console.log(`  ${label}: ${plans.length} enrollments, ${classKeys.size} classes`);
    totalEnroll += plans.length;
    totalClasses += classKeys.size;
    if (!confirm) continue;

    // academic year (create if missing, historical = inactive)
    let year = await prisma.academicYear.findFirst({ where: { tenantId: T, label }, select: { id: true } });
    if (!year) {
      year = await prisma.academicYear.create({
        data: {
          tenantId: T, label, isActive: false,
          startDate: new Date(`${sy - 1}-09-01T00:00:00.000Z`),
          endDate: new Date(`${sy}-06-30T00:00:00.000Z`),
        },
        select: { id: true },
      });
    }
    // classes
    const classIdByKey = new Map<string, string>();
    for (const [key, info] of classKeys) {
      const cls = await prisma.class.upsert({
        where: { tenantId_academicYearId_level_section: { tenantId: T, academicYearId: year.id, level: info.level, section: info.section } },
        update: {},
        create: { tenantId: T, academicYearId: year.id, level: info.level, section: info.section, name: `${info.level} ${info.section}`, darsClassId: info.darsClassId },
        select: { id: true },
      });
      classIdByKey.set(key, cls.id);
    }
    // enrollments
    for (let i = 0; i < plans.length; i += 10) {
      await Promise.all(
        plans.slice(i, i + 10).map((pl) => {
          const classId = classIdByKey.get(`${pl.level}␟${pl.section}`)!;
          return prisma.enrollment.upsert({
            where: { studentId_academicYearId: { studentId: pl.studentId!, academicYearId: year!.id } },
            update: { classId },
            create: { tenantId: T, studentId: pl.studentId!, classId, academicYearId: year!.id },
          });
        }),
      );
    }
    process.stdout.write(`\r  ${label}: done`);
    process.stdout.write("\n");
  }

  console.log(`\nTotal: ${totalEnroll} enrollments across ${SYEARS.length} years`);
  if (!confirm) console.log("🟡 DRY RUN — re-run with --confirm to apply.");
  else console.log("✓ Historical enrollments imported.");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
