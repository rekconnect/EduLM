import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  if (!t) return;
  const total = await p.user.count({ where: { tenantId: t.id, role: "PARENT", darsParentId: { not: null } } });
  const synth = await p.user.count({
    where: { tenantId: t.id, role: "PARENT", email: { endsWith: "@import.lyceemontaigne.local" } },
  });
  console.log(`Imported parents:        ${total}`);
  console.log(`  with REAL email:       ${total - synth}`);
  console.log(`  with placeholder email:${synth}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
