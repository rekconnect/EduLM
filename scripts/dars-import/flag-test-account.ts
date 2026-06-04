import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const email = process.argv[2] ?? "raed.elkady@outlook.com";
  const r = await p.user.updateMany({
    where: { email },
    data: { mustChangePassword: true },
  });
  const after = await p.user.findFirst({
    where: { email },
    select: { email: true, status: true, mustChangePassword: true },
  });
  console.log(`Updated ${r.count} account(s).`);
  console.log("Now:", JSON.stringify(after));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
