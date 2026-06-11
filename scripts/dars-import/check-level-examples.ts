/** Read-only: one example active-year student per level, to test the fiche. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  for (const lvl of ["CE2", "3ème", "2nde", "1ère", "Terminale"]) {
    const s = await prisma.student.findFirst({
      where: {
        tenantId: tenant.id,
        enrollments: { some: { academicYear: { isActive: true }, class: { level: lvl } } },
      },
      select: { firstName: true, lastName: true },
    });
    console.log(lvl.padEnd(10), s ? `${s.lastName} ${s.firstName}` : "(aucun)");
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
