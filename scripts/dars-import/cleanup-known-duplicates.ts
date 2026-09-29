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
  // (2026-09-29) The former "Rizkallah mother → Daniella Makdessi" override
  // was REMOVED: Raed established that Dars is the family-data authority
  // (registration happens there; Pronote is typed by hand) and Dars says
  // NADA NEHME for both children. The error was on Pronote's side (George's
  // responsable), not in Dars — nothing to heal here anymore.
  console.log(CONFIRM ? "Terminé." : "Dry-run — relancer avec --confirm.");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
