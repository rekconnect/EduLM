/** Seed the 25 existing circuits "0 - Ordinaire" … "24 - Ordinaire" (skips
 *  any that already exist). Dry-run; --confirm to write. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");
  const existing = new Set(
    (
      await prisma.busCircuit.findMany({
        where: { tenantId: tenant.id },
        select: { autocarNumber: true, activite: true },
      })
    ).map((c) => `${c.autocarNumber}|${c.activite}`),
  );
  let created = 0;
  for (let n = 0; n <= 24; n++) {
    const key = `${n}|Ordinaire`;
    if (existing.has(key)) continue;
    console.log(`  + ${n} - Ordinaire`);
    if (confirm) {
      await prisma.busCircuit.create({
        data: { tenantId: tenant.id, autocarNumber: String(n), activite: "Ordinaire" },
      });
    }
    created++;
  }
  console.log(`${confirm ? "✓ créés" : "À créer"}: ${created}`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
