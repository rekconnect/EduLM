/**
 * Idempotent cleanup of KNOWN Dars duplicate students (runbook step 4c).
 * These rows exist in the Dars TABLES (hidden by the Dars UI's active-only
 * filter), so every full re-import recreates their EduLM fiches. Run this
 * after each re-import to keep EduLM clean.
 *
 * Per case: moves any invoices from the stray to the keeper (Invoice→Student
 * is onDelete:Cascade — deleting first would destroy billing history), then
 * deletes the stray fiche if it carries no enrollments.
 *
 *   npx tsx --env-file=.env scripts/dars-import/cleanup-known-duplicates.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

/** darsStudentId of the stray; keeper receives the stray's invoices. */
const KNOWN_DUPES: Array<{ label: string; strayDarsId: number; keeperDarsId?: number }> = [
  // DIB Mateo: D00031 (#1153) is the empty shell; D00071 (#1344) is the real one.
  { label: "DIB Mateo D00031", strayDarsId: 1153, keeperDarsId: 1344 },
  // TANNOURY Liam: T00191 (#1532) carried only invoices; T00222 (#1793) has the history.
  { label: "TANNOURY Liam T00191", strayDarsId: 1532, keeperDarsId: 1793 },
];

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  for (const d of KNOWN_DUPES) {
    const stray = await prisma.student.findFirst({
      where: { tenantId: tenant.id, darsStudentId: d.strayDarsId },
      select: { id: true, _count: { select: { enrollments: true, invoices: true } } },
    });
    if (!stray) { console.log(`  ${d.label}: absent — rien à faire`); continue; }
    const keeper = d.keeperDarsId
      ? await prisma.student.findFirst({ where: { tenantId: tenant.id, darsStudentId: d.keeperDarsId }, select: { id: true } })
      : null;
    if (stray._count.invoices > 0 && !keeper) {
      console.log(`  ! ${d.label}: ${stray._count.invoices} factures mais keeper introuvable — SKIP`);
      continue;
    }
    if (stray._count.enrollments > 0) {
      console.log(`  ! ${d.label}: porte ${stray._count.enrollments} inscriptions — SKIP (à vérifier à la main)`);
      continue;
    }
    console.log(`  ${d.label}: suppression (factures à déplacer: ${stray._count.invoices})`);
    if (!CONFIRM) continue;
    if (stray._count.invoices > 0 && keeper) {
      await prisma.invoice.updateMany({ where: { tenantId: tenant.id, studentId: stray.id }, data: { studentId: keeper.id } });
    }
    await prisma.student.delete({ where: { id: stray.id } });
    console.log(`  ✓ ${d.label} supprimé`);
  }
  // ── Known data overrides that a re-import reverts (Dars still wrong) ──
  // Rizkallah mother (Dars parent #13813 says NADA NEHME; correct per Raed
  // 2026-09-28 is Daniella MAKDESSI — until the secretariat fixes Dars).
  const mother = await prisma.user.findFirst({
    where: { tenantId: tenant.id, darsParentId: 13813 },
    select: { id: true, name: true, email: true },
  });
  if (mother && (mother.name !== "Daniella MAKDESSI" || mother.email !== "daniella.makdessi@gmail.com")) {
    console.log(`  Mère Rizkallah: '${mother.name}' → 'Daniella MAKDESSI'`);
    if (CONFIRM) {
      await prisma.user.update({
        where: { id: mother.id },
        data: { name: "Daniella MAKDESSI", email: "daniella.makdessi@gmail.com" },
      });
      console.log("  ✓ corrigée");
    }
  } else if (mother) {
    console.log("  Mère Rizkallah: déjà correcte");
  }

  console.log(CONFIRM ? "Terminé." : "Dry-run — relancer avec --confirm.");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
