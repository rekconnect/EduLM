/** Read-only: progress of the vaccine rename (named vs still "Vaccin #"). */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.studentImmunization.groupBy({ by: ["vaccine"], _count: true });
  const renamed = rows.filter((r) => !r.vaccine.startsWith("Vaccin #")).reduce((a, r) => a + r._count, 0);
  const old = rows.filter((r) => r.vaccine.startsWith("Vaccin #")).reduce((a, r) => a + r._count, 0);
  console.log(`nommés: ${renamed} · encore "Vaccin #": ${old}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
