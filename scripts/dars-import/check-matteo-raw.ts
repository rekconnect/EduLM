/** Read-only: Matteo Kassis' raw bus_periods JSON (who cleared it & how). */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
const prisma = new PrismaClient();
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const st = await prisma.student.findFirst({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Matteo", mode: "insensitive" },
      lastName: { contains: "Kassis", mode: "insensitive" },
    },
    select: { lastName: true, updatedAt: true, customAnswers: true },
  });
  const ca = (st?.customAnswers ?? {}) as Record<string, unknown>;
  console.log("updatedAt:", st?.updatedAt.toISOString());
  console.log("bus_periods:", String(ca.bus_periods ?? "(absent)"));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
