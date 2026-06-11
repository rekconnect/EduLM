/**
 * Read-only: pick calibration students for the vaccine-name mapping — students
 * with a SMALL, distinctive set of "done" immunizations in the current (100+)
 * id group, plus one with legacy (1-20) ids. Raed opens them in Dars and tells
 * us which named vaccines are checked → anchors id ↔ name with certainty.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const imms = await prisma.studentImmunization.findMany({
    where: { tenantId: tenant.id, done: true },
    select: {
      darsImmunizationId: true,
      year: true,
      month: true,
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const byStudent = new Map<string, { name: string; ids: number[] }>();
  for (const i of imms) {
    const k = i.student.id;
    const cur = byStudent.get(k) ?? { name: `${i.student.lastName} ${i.student.firstName}`, ids: [] };
    if (i.darsImmunizationId != null) cur.ids.push(i.darsImmunizationId);
    byStudent.set(k, cur);
  }

  // Current-form students (ids >= 100): few done → easy to compare on screen.
  const current = [...byStudent.values()]
    .filter((s) => s.ids.every((id) => id >= 100))
    .sort((a, b) => a.ids.length - b.ids.length);
  console.log("=== Élèves à VÉRIFIER dans Dars (formulaire actuel, ids 100+) ===");
  for (const s of [...current.slice(0, 3), ...current.slice(-2)])
    console.log(`  ${s.name}: ids faits = [${s.ids.sort((a, b) => a - b).join(", ")}] (${s.ids.length} vaccins cochés)`);

  // Legacy students (ids < 100).
  const legacy = [...byStudent.values()]
    .filter((s) => s.ids.some((id) => id < 100))
    .sort((a, b) => a.ids.length - b.ids.length);
  console.log("\n=== Élèves ancien formulaire (ids 1-20) ===");
  for (const s of legacy.slice(0, 3))
    console.log(`  ${s.name}: ids faits = [${s.ids.sort((a, b) => a - b).join(", ")}]`);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
