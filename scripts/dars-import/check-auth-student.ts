/**
 * Read-only: where does a student's photo-authorization data live —
 * the single-value customAnswers (auth_*) or the per-year registration
 * snapshot? Defaults to Gwen Abbosh.
 *   npx tsx scripts/dars-import/check-auth-student.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const val = (ca: Record<string, unknown>, k: string) =>
  typeof ca[k] === "string" ? (ca[k] as string) : "";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { firstName: { contains: "Gwen", mode: "insensitive" } },
        { lastName: { contains: "Abbosh", mode: "insensitive" } },
      ],
    },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`\n=== ${s.firstName} ${s.lastName} ===`);
    console.log("single-value customAnswers:");
    console.log(
      `  auth_site=${JSON.stringify(val(ca, "auth_site"))} auth_livre=${JSON.stringify(val(ca, "auth_livre"))} auth_reseaux=${JSON.stringify(val(ca, "auth_reseaux"))} auth_radio=${JSON.stringify(val(ca, "auth_radio"))} quitter_seul=${JSON.stringify(val(ca, "quitter_seul"))}`,
    );
    console.log(
      `  collations=${JSON.stringify(val(ca, "collations"))} repas_chaud=${JSON.stringify(val(ca, "repas_chaud"))} autocar=${JSON.stringify(val(ca, "autocar"))}`,
    );
    const reg = val(ca, "registration_by_year");
    console.log("registration_by_year:", reg || "(none)");
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
