/**
 * Read-only: who carries legacy ids 19 / 20? Overlap with the current-form
 * cohort (ids 100+), co-occurring legacy ids, and isolating students whose
 * Dars screen would name them.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const imms = await prisma.studentImmunization.findMany({
    where: { tenantId: tenant.id },
    select: {
      darsImmunizationId: true,
      done: true,
      notes: true,
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const byStudent = new Map<string, { name: string; all: number[]; done: number[] }>();
  for (const i of imms) {
    const k = i.student.id;
    const cur = byStudent.get(k) ?? { name: `${i.student.lastName} ${i.student.firstName}`, all: [], done: [] };
    if (i.darsImmunizationId != null) {
      cur.all.push(i.darsImmunizationId);
      if (i.done) cur.done.push(i.darsImmunizationId);
    }
    byStudent.set(k, cur);
  }

  for (const target of [19, 20]) {
    const holders = [...byStudent.values()].filter((s) => s.all.includes(target));
    const withCurrent = holders.filter((s) => s.all.some((id) => id >= 100)).length;
    const doneHolders = holders.filter((s) => s.done.includes(target));
    console.log(`\n=== id ${target}: ${holders.length} élèves (dont ${withCurrent} ont aussi le formulaire actuel 100+) ===`);
    console.log(`   marqués FAITS: ${doneHolders.length}`);
    for (const s of doneHolders.slice(0, 5))
      console.log(`   • ${s.name} — faits: [${s.done.sort((a, b) => a - b).join(", ")}]`);
  }

  // Notes samples for 19/20 rows.
  const notes19 = imms.filter((i) => i.darsImmunizationId === 19 && i.notes).slice(0, 5);
  const notes20 = imms.filter((i) => i.darsImmunizationId === 20 && i.notes).slice(0, 5);
  console.log("\nNotes id 19:", notes19.map((n) => n.notes).join(" | ") || "(aucune)");
  console.log("Notes id 20:", notes20.map((n) => n.notes).join(" | ") || "(aucune)");

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
