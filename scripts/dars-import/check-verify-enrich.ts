/**
 * Read-only verification after re-seed + re-enrich: actuel on parents,
 * transport fields on students, and a focused look at family R0011.
 *   npx tsx scripts/dars-import/check-verify-enrich.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const has = (ca: unknown, k: string) =>
  !!ca && typeof ca === "object" && (ca as Record<string, unknown>)[k] != null;
const val = (ca: unknown, k: string) =>
  ca && typeof ca === "object"
    ? (ca as Record<string, unknown>)[k] ?? ""
    : "";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const parents = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: "PARENT" },
    select: { customAnswers: true, guardianProfile: { select: { relation: true } } },
  });
  let actuelYes = 0,
    actuelNo = 0,
    actuelMere = 0;
  for (const p of parents) {
    const a = val(p.customAnswers, "actuel");
    if (a === "yes") actuelYes++;
    else if (a === "no") actuelNo++;
    if (has(p.customAnswers, "actuel") && p.guardianProfile?.relation === "mere")
      actuelMere++;
  }
  console.log(`Parents: ${parents.length}`);
  console.log(`  actuel=yes: ${actuelYes}, actuel=no: ${actuelNo}`);
  console.log(`  mothers with an actuel value: ${actuelMere}`);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { customAnswers: true },
  });
  let aller = 0,
    adresseDiff = 0,
    authLivre = 0;
  for (const s of students) {
    if (has(s.customAnswers, "transport_aller")) aller++;
    if (val(s.customAnswers, "transport_adresse_diff") === "yes") adresseDiff++;
    if (has(s.customAnswers, "auth_livre")) authLivre++;
  }
  console.log(`Students: ${students.length}`);
  console.log(`  with transport_aller set: ${aller}`);
  console.log(`  with alternate transport address: ${adresseDiff}`);
  console.log(`  with auth_livre set: ${authLivre}`);

  console.log("\n=== Family R0011 ===");
  const fam = await prisma.family.findFirst({
    where: { tenantId: tenant.id, code: "R0011" },
    select: {
      guardians: {
        select: {
          relation: true,
          user: { select: { firstName: true, lastName: true, customAnswers: true } },
        },
      },
      students: { select: { firstName: true, lastName: true, customAnswers: true } },
    },
  });
  for (const g of fam?.guardians ?? []) {
    console.log(
      `  [${g.relation}] ${g.user.firstName} ${g.user.lastName} — actuel=${JSON.stringify(val(g.user.customAnswers, "actuel"))} decede=${JSON.stringify(val(g.user.customAnswers, "decede"))}`,
    );
  }
  for (const s of fam?.students ?? []) {
    console.log(
      `  élève ${s.firstName} ${s.lastName} — collations=${JSON.stringify(val(s.customAnswers, "collations"))} aller=${JSON.stringify(val(s.customAnswers, "transport_aller"))} auth_livre=${JSON.stringify(val(s.customAnswers, "auth_livre"))} auth_radio=${JSON.stringify(val(s.customAnswers, "auth_radio"))}`,
    );
  }

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
