import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const first = process.argv[2] ?? "Christina";
  const last = process.argv[3] ?? "Bassili";
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const users = await p.user.findMany({
    where: {
      tenantId: t!.id,
      role: "PARENT",
      OR: [
        { firstName: { contains: first, mode: "insensitive" } },
        { lastName: { contains: last, mode: "insensitive" } },
      ],
    },
    select: {
      id: true, firstName: true, lastName: true, darsParentId: true, customAnswers: true,
      guardianProfile: { select: { relation: true, familyId: true, family: { select: { code: true } } } },
    },
    take: 10,
  });
  for (const u of users) {
    const ca = (u.customAnswers ?? {}) as Record<string, unknown>;
    const ar = Object.fromEntries(Object.entries(ca).filter(([k]) => k.includes("_ar") || k.includes("registre")));
    console.log(`${u.firstName} ${u.lastName} | dars=${u.darsParentId} | rel=${u.guardianProfile?.relation} | fam=${u.guardianProfile?.family?.code}`);
    console.log("  arabic/registre keys:", JSON.stringify(ar));
    console.log("  total CA keys:", Object.keys(ca).length);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
