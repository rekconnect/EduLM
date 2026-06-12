/** Read-only: find Georgia Dibs spelling variants in EduLM. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.student.findMany({
    where: {
      OR: [
        { lastName: { contains: "dib", mode: "insensitive" } },
        { firstName: { contains: "georgia", mode: "insensitive" } },
      ],
    },
    select: { firstName: true, lastName: true },
  });
  for (const s of r) console.log(`${s.lastName} | ${s.firstName}`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
