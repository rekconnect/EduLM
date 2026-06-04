import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
const prisma = new PrismaClient();
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const cycles = await prisma.admissionCycle.findMany({
    where: { tenantId: tenant.id },
    select: { label: true, targetYearLabel: true, isActive: true, currency: true, inscriptionFeeCents: true, fieldConfig: true },
  });
  for (const c of cycles) {
    const fc = c.fieldConfig as Record<string, unknown>;
    const keys = Object.keys(fc ?? {});
    console.log(`\nCycle "${c.label}" → ${c.targetYearLabel}  active=${c.isActive}  ${c.currency} fee=${c.inscriptionFeeCents}`);
    console.log(`  fieldConfig keys: ${keys.length ? keys.join(", ") : "(empty)"}`);
    if ((fc as any)?.customQuestions) {
      console.log(`  customQuestions: ${JSON.stringify((fc as any).customQuestions).slice(0, 300)}`);
    }
  }
  const tabs = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { inscriptionTabsConfig: true } });
  console.log(`\ninscriptionTabsConfig: ${JSON.stringify(tabs?.inscriptionTabsConfig)}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
