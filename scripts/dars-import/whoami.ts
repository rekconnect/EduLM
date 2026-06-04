import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const email = process.argv[2] ?? "raed.elkady@outlook.com";
  const u = await p.user.findFirst({
    where: { email },
    select: {
      email: true, role: true, status: true, mustChangePassword: true,
      darsParentId: true,
      guardianProfile: {
        select: { childLinks: { select: { student: { select: { firstName: true, lastName: true, status: true } } } } },
      },
    },
  });
  console.log(JSON.stringify(u, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
