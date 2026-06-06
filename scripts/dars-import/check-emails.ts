import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const ids = process.argv.slice(2).map(Number);
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const us = await p.user.findMany({
    where: { tenantId: t!.id, darsParentId: { in: ids } },
    select: { email: true, status: true, darsParentId: true },
  });
  for (const u of us) console.log(u.darsParentId, "|", u.status, "|", u.email);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
