/**
 * Reconcile Student.status from enrollment reality — the re-import ADDS/UPDATES
 * but never marks who left, so departed students keep a stale ENROLLED status.
 *
 * For each student:
 *   - enrolled in the active year OR any later year  → ENROLLED   (current / incoming)
 *   - otherwise, last enrolled level is Terminale     → GRADUATED  (finished lycée)
 *   - otherwise (only past enrollments)               → WITHDRAWN  (left)
 *   - no enrollments at all                            → left as-is (PROSPECT etc.)
 *
 * Idempotent — updates only the rows whose status is wrong. Safe to re-run
 * after every import / year rollover.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/reconcile-student-status.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, StudentStatus } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const isTerminale = (level: string) => {
  const n = norm(level);
  return n === "terminale" || n === "tle" || n.startsWith("term");
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const active = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { startDate: true, label: true },
  });
  if (!active) {
    console.error("No active academic year — set one first (/admin/years).");
    process.exit(1);
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      status: true,
      enrollments: {
        select: {
          class: { select: { level: true } },
          academicYear: { select: { startDate: true } },
        },
      },
    },
  });

  const target: Record<StudentStatus, string[]> = {
    ENROLLED: [],
    GRADUATED: [],
    WITHDRAWN: [],
    PROSPECT: [],
  };

  for (const s of students) {
    if (s.enrollments.length === 0) continue; // no signal — leave PROSPECT etc.
    const currentOrFuture = s.enrollments.some(
      (e) => e.academicYear.startDate >= active.startDate,
    );
    let want: StudentStatus;
    if (currentOrFuture) {
      want = "ENROLLED";
    } else {
      const last = s.enrollments.reduce((a, b) =>
        b.academicYear.startDate > a.academicYear.startDate ? b : a,
      );
      want = isTerminale(last.class.level) ? "GRADUATED" : "WITHDRAWN";
    }
    if (want !== s.status) target[want].push(s.id);
  }

  const changes = (["ENROLLED", "GRADUATED", "WITHDRAWN"] as StudentStatus[])
    .map((st) => `${st}: ${target[st].length}`)
    .join("  |  ");
  console.log(`Active year: ${active.label}`);
  console.log(`Students: ${students.length}`);
  console.log(`Status corrections → ${changes}`);

  if (!confirm) {
    console.log("\n[DRY-RUN] --confirm to write.");
    await prisma.$disconnect();
    return;
  }

  for (const st of ["ENROLLED", "GRADUATED", "WITHDRAWN"] as StudentStatus[]) {
    if (target[st].length === 0) continue;
    await prisma.student.updateMany({
      where: { tenantId: tenant.id, id: { in: target[st] } },
      data: { status: st },
    });
  }
  console.log("✓ Statuses reconciled.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
