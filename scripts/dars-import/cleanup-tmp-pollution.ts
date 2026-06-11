/**
 * Cleanup for students with NO Isc_ModifStudents row whose registration_by_year
 * + single-value consents are pure Tmp-merge pollution (the re-run could not
 * rebuild them, since there's no finalized source). They are identified by the
 * leftover "arabe_langue" marker (only the buggy Tmp merge ever set it). For
 * these students the correct state is NO registration data at all, so we strip
 * registration_by_year + the consent single-values from customAnswers.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/cleanup-tmp-pollution.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

// Keys the Tmp merge could have written (per-year blob + single consents).
const STRIP = [
  "registration_by_year",
  "arabe_langue",
  "quitter_seul",
  "transport_aller",
  "transport_retour",
  "transport_adresse_diff",
  "transport_caza",
  "transport_village",
  "transport_rue",
  "transport_immeuble",
  "transport_etage",
  "transport_place",
  "transport_remarque",
  "transport_person",
  "auth_site",
  "auth_livre",
  "auth_reseaux",
  "auth_radio",
];

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; name: string }> = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    // Only the still-polluted (no-Modif) set carries arabe_langue in reg.
    if (
      typeof ca.registration_by_year !== "string" ||
      !ca.registration_by_year.includes("arabe_langue")
    )
      continue;
    const next = { ...ca };
    let removed = 0;
    for (const k of STRIP)
      if (k in next) {
        delete next[k];
        removed++;
      }
    if (removed > 0)
      updates.push({ id: s.id, ca: next, name: `${s.lastName} ${s.firstName}` });
  }

  console.log(`Students to clean (no-Modif, Tmp-polluted): ${updates.length}`);
  for (const u of updates.slice(0, 15)) console.log(`   • ${u.name}`);
  if (updates.length > 15) console.log(`   … +${updates.length - 15} more`);

  if (!CONFIRM) {
    console.log(`\nDry-run. Re-run with --confirm to write ${updates.length} students.`);
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) =>
            prisma.student.update({
              where: { id: u.id },
              data: { customAnswers: u.ca as Prisma.InputJsonValue },
            }),
          ),
        );
        done += chunk.length;
        break;
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }
  console.log(`✓ Cleaned ${done} students.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
