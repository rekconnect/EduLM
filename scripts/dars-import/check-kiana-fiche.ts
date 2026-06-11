/** Read-only: FIDAWI Kiana's immunizations as the Santé tab now shows them. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
const prisma = new PrismaClient();
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const st = await prisma.student.findFirst({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Kiana", mode: "insensitive" },
      lastName: { contains: "Fidawi", mode: "insensitive" },
    },
    select: {
      firstName: true,
      lastName: true,
      immunizations: {
        where: { done: true },
        orderBy: { darsImmunizationId: "asc" },
        select: { vaccine: true, darsImmunizationId: true, notes: true },
      },
    },
  });
  console.log(`${st?.firstName} ${st?.lastName} — vaccins faits:`);
  for (const i of st?.immunizations ?? [])
    console.log(`  [${i.darsImmunizationId}] ${i.vaccine}${i.notes ? ` — ${i.notes}` : ""}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
