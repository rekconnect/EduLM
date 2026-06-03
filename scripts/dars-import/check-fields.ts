import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  if (!t) return;

  // Guardian phone coverage
  const gTotal = await p.guardian.count({ where: { tenantId: t.id } });
  const gPhone = await p.guardian.count({ where: { tenantId: t.id, phone: { not: null } } });
  console.log(`Guardians with phone: ${gPhone} / ${gTotal}`);
  const sampleG = await p.guardian.findMany({
    where: { tenantId: t.id, phone: { not: null } },
    take: 3,
    select: { phone: true, relation: true, user: { select: { firstName: true, lastName: true } } },
  });
  console.log("  sample:", JSON.stringify(sampleG));

  // Family address coverage
  const fTotal = await p.family.count({ where: { tenantId: t.id } });
  const fAddr = await p.family.count({ where: { tenantId: t.id, addressCity: { not: null } } });
  console.log(`\nFamilies with addressCity: ${fAddr} / ${fTotal}`);
  const sampleF = await p.family.findMany({
    where: { tenantId: t.id, addressCity: { not: null } },
    take: 3,
    select: { code: true, addressStreet: true, addressHood: true, addressCity: true, addressCountry: true },
  });
  console.log("  sample:", JSON.stringify(sampleF, null, 1));

  // Student address columns (mirrored) — did we populate them?
  const sTotal = await p.student.count({ where: { tenantId: t.id } });
  const sAddr = await p.student.count({ where: { tenantId: t.id, city: { not: null } } });
  const sCountry = await p.student.count({ where: { tenantId: t.id, country: { not: null } } });
  console.log(`\nStudents with city: ${sAddr} / ${sTotal};  with country: ${sCountry}`);
  const sampleS = await p.student.findMany({
    where: { tenantId: t.id },
    take: 3,
    select: { firstName: true, lastName: true, address: true, city: true, country: true, placeOfBirth: true, family: { select: { addressCity: true, addressStreet: true } } },
  });
  console.log("  sample:", JSON.stringify(sampleS, null, 1));

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
