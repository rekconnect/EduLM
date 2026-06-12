/** Read-only: all distinct remarques patterns in bus_periods T3 — find the
 *  "Soir: tournée collège · Activités: …" markers from the BUS MAJ import. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  let withRemark = 0;
  const acts: string[] = [];
  const others = new Map<string, number>();
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { continue; }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    const r = (p.remarques ?? "").trim();
    if (!r) continue;
    withRemark++;
    if (/activit/i.test(r) || /tourn[ée]e/i.test(r)) {
      acts.push(`${s.lastName} ${s.firstName} — AS:${p.as === "yes" ? (p.activite_matin === "yes" ? "A" : "O") : "—"} RS:${p.rs === "yes" ? (p.activite_soir === "yes" ? "A" : "O") : "—"} — "${r}"`);
    } else {
      others.set(r, (others.get(r) ?? 0) + 1);
    }
  }
  console.log(`Remarques non vides: ${withRemark}`);
  console.log(`\n— Avec "activité"/"tournée" (${acts.length}) —  [AS/RS: A=flag activité, O=ordinaire]`);
  for (const a of acts) console.log(`  • ${a}`);
  console.log(`\n— Autres remarques (${others.size} distinctes) —`);
  for (const [r, n] of [...others.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${n} × "${r}"`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
