/**
 * Read-only: minimal Dars-lookup plan to pin the remaining vaccine ids.
 * KNOWN so far: 100=HepB1 101=HepB2 102=HepB3 103=DPT4 117=DPT1 118=DPT2
 * 119=DPT3 107=Pneumo1 108=Pneumo2 109=Pneumo3.
 * For each UNKNOWN id, find students whose done-set contains that id plus
 * ONLY known ids (singleton isolation) — one glance at their Dars screen
 * names the id. Output: per unknown id, up to 2 candidate students.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const KNOWN = new Set([100, 101, 102, 103, 107, 108, 109, 117, 118, 119]);
const UNKNOWN = [104, 105, 106, 110, 111, 112, 113, 114, 115, 116, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129];

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const imms = await prisma.studentImmunization.findMany({
    where: { tenantId: tenant.id, done: true, darsImmunizationId: { gte: 100 } },
    select: {
      darsImmunizationId: true,
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const byStudent = new Map<string, { name: string; ids: number[] }>();
  for (const i of imms) {
    const k = i.student.id;
    const cur = byStudent.get(k) ?? { name: `${i.student.lastName} ${i.student.firstName}`, ids: [] };
    cur.ids.push(i.darsImmunizationId!);
    byStudent.set(k, cur);
  }

  console.log("=== Élèves qui isolent UN SEUL id inconnu (1 coup d'œil = 1 nom) ===");
  const pinned = new Set<number>();
  for (const u of UNKNOWN) {
    const candidates = [...byStudent.values()]
      .filter((s) => s.ids.includes(u) && s.ids.every((id) => id === u || KNOWN.has(id)))
      .sort((a, b) => a.ids.length - b.ids.length)
      .slice(0, 2);
    if (candidates.length) {
      pinned.add(u);
      console.log(`  id ${u}: ${candidates.map((c) => `${c.name} (${c.ids.length} cochés)`).join("  OU  ")}`);
    }
  }

  const left = UNKNOWN.filter((u) => !pinned.has(u));
  console.log(`\n=== Ids sans isolateur direct: [${left.join(", ")}] ===`);
  // For those, find students with the FEWEST unknown ids (2-3 together).
  for (const u of left) {
    const cands = [...byStudent.values()]
      .map((s) => ({ s, unknowns: s.ids.filter((id) => !KNOWN.has(id)) }))
      .filter((x) => x.unknowns.includes(u))
      .sort((a, b) => a.unknowns.length - b.unknowns.length)
      .slice(0, 1);
    for (const c of cands)
      console.log(`  id ${u}: ${c.s.name} → inconnus ensemble [${[...new Set(c.unknowns)].sort((a, b) => a - b).join(", ")}]`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
