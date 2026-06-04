import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const code = process.argv[2] ?? "186";
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const fam = await p.family.findFirst({
    where: { tenantId: t!.id, code },
    select: {
      code: true,
      guardians: {
        select: {
          relation: true,
          user: { select: { firstName: true, lastName: true, customAnswers: true } },
        },
      },
    },
  });
  if (!fam) { console.log("no family"); await p.$disconnect(); return; }
  console.log("Family", fam.code);
  for (const g of fam.guardians) {
    const ca = (g.user.customAnswers ?? {}) as Record<string, unknown>;
    const arabic = {
      nom_ar: ca.nom_ar, prenom_ar: ca.prenom_ar, nom_pere_ar: ca.nom_pere_ar,
      lieu_registre: ca.lieu_registre, caza_registre: ca.caza_registre,
    };
    console.log(`\n  ${g.relation} — ${g.user.firstName} ${g.user.lastName}`);
    console.log("    arabic keys:", JSON.stringify(arabic));
    console.log("    total customAnswers keys:", Object.keys(ca).length);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
