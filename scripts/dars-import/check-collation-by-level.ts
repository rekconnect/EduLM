/**
 * Read-only: for the active academic year, show the collation rate per class
 * level — to see whether collation is effectively obligatory for maternelle
 * (PS / MS / GS).
 *   npx tsx scripts/dars-import/check-collation-by-level.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const isYes = (v: unknown) =>
  typeof v === "string" && /^(yes|oui|true|1)$/i.test(v.trim());

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const years = await prisma.academicYear.findMany({
    where: { tenantId: tenant.id },
    orderBy: { startDate: "desc" },
    select: { id: true, label: true, isActive: true },
  });
  const year = years.find((y) => y.isActive) ?? years[0];
  if (!year) return;
  console.log(`Active year: ${year.label}\n`);

  const enr = await prisma.enrollment.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id },
    select: {
      class: { select: { level: true } },
      student: { select: { customAnswers: true } },
    },
  });

  const byLevel = new Map<string, { total: number; col: number; can: number; bus: number }>();
  for (const e of enr) {
    const lvl = e.class.level || "—";
    const ca = (e.student.customAnswers ?? {}) as Record<string, unknown>;
    const b = byLevel.get(lvl) ?? { total: 0, col: 0, can: 0, bus: 0 };
    b.total++;
    if (isYes(ca.collations)) b.col++;
    if (isYes(ca.repas_chaud)) b.can++;
    if (isYes(ca.autocar)) b.bus++;
    byLevel.set(lvl, b);
  }

  const rows = [...byLevel.entries()]
    .map(([level, b]) => ({
      level,
      total: b.total,
      collation: `${b.col} (${Math.round((b.col / b.total) * 100)}%)`,
      cantine: `${b.can} (${Math.round((b.can / b.total) * 100)}%)`,
      transport: `${b.bus} (${Math.round((b.bus / b.total) * 100)}%)`,
    }))
    .sort((a, b) => a.level.localeCompare(b.level, "fr"));
  console.table(rows);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
