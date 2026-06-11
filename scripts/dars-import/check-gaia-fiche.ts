/** Read-only: Gaïa Gemayel's done vaccines — Fièvre jaune (id 20) must show. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
const prisma = new PrismaClient();
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const st = await prisma.student.findFirst({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Ga", mode: "insensitive" },
      lastName: { contains: "Gemayel", mode: "insensitive" },
      immunizations: { some: { darsImmunizationId: 20, done: true } },
    },
    select: {
      firstName: true,
      lastName: true,
      immunizations: {
        where: { done: true },
        orderBy: { darsImmunizationId: "asc" },
        select: { vaccine: true, darsImmunizationId: true },
      },
    },
  });
  console.log(`${st?.firstName} ${st?.lastName} — faits:`);
  console.log((st?.immunizations ?? []).map((i) => `[${i.darsImmunizationId}] ${i.vaccine}`).join(" · "));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
