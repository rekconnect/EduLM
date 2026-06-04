import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  if (!t) return;
  const base = { tenantId: t.id, role: "PARENT" as const };
  const active = await p.user.count({ where: { ...base, status: "ACTIVE" } });
  const disabled = await p.user.count({ where: { ...base, status: "DISABLED" } });
  const mustChange = await p.user.count({ where: { ...base, mustChangePassword: true } });
  const activeChanged = await p.user.count({ where: { ...base, status: "ACTIVE", mustChangePassword: false } });
  console.log(`Parent accounts:`);
  console.log(`  ACTIVE:                       ${active}`);
  console.log(`  DISABLED:                     ${disabled}`);
  console.log(`  mustChangePassword = true:    ${mustChange}`);
  console.log(`  ACTIVE & already changed:     ${activeChanged}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
