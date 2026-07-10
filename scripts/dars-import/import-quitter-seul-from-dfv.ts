/**
 * Import the "autorisé à quitter seul" consent from Dars' EAV consent store
 * (Isc_DynamicFieldValues, FieldName='AllowLeaveAlone') into EduLM — REAL answers
 * only, NEVER defaulted (it's a safety consent). Students with no answer in Dars
 * stay absent ("-"). This is the richer consent table (~805 answered for the
 * active year) that phase1c-enrich never read; the photo rights come from the
 * school's Bilan Excel instead (import-photo-auth-from-xlsx.ts).
 *
 * Grain: Isc_DynamicFieldValues.Id_Person = Isc_StudentClass.ID (per-student,
 * per-SYear enrollment). Joined to get ID_Student (= EduLM darsStudentId) + SYear.
 * keyValue 'True'/'False' → yes/no.
 *
 * Writes registration_by_year[<active year>].quitter_seul (what StudentYearView
 * reads) AND flat customAnswers.quitter_seul (stable-consent fallback). Every
 * other key is preserved.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 *   npx tsx scripts/dars-import/import-quitter-seul-from-dfv.ts \
 *     --tenant-name="Lycée Montaigne" [--syear=2026] [--confirm]
 *
 * NOTE: --syear defaults to 2026 (= academic 2025-2026). Bump it at rollover.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const DEFAULT_SYEAR = 2026;

async function main() {
  const { tenantName, confirm } = parseFlags();
  const syArg = process.argv.find((a) => a.startsWith("--syear="));
  const SYEAR = syArg ? Number(syArg.split("=")[1]) : DEFAULT_SYEAR;
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const activeYear = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  if (!activeYear) {
    console.error("No active academic year — set one first (/admin/years).");
    process.exit(1);
  }
  const YEAR = activeYear.label;
  console.log(`Année cible: ${YEAR} (SYear ${SYEAR})`);

  // ── Dars DFV: AllowLeaveAlone per student for this SYear ──
  const rows = await darsQuery<{ ID_Student: number; keyValue: string }>(
    `SELECT sc.ID_Student, v.keyValue
     FROM Isc_DynamicFieldValues v
     JOIN Isc_StudentClass sc ON sc.ID = v.Id_Person
     WHERE v.Id_College=${C} AND v.TableName='StudentsClass' AND sc.SYear=${SYEAR}
       AND v.FieldName='AllowLeaveAlone'`,
  );
  const byDars = new Map<number, string>();
  for (const r of rows) {
    byDars.set(Number(r.ID_Student), String(r.keyValue) === "True" ? "yes" : "no");
  }
  const yesN = [...byDars.values()].filter((v) => v === "yes").length;
  console.log(
    `Dars DFV (quitter seul) réponses: ${byDars.size}  ·  OUI: ${yesN}  ·  NON: ${byDars.size - yesN}`,
  );
  if (byDars.size === 0) {
    console.error(`Aucune réponse DFV pour SYear ${SYEAR}. Vérifiez --syear (au rollover il change).`);
    await prisma.$disconnect();
    await closeDars();
    process.exit(1);
  }

  // ── EduLM active-year students ──
  const studs = await prisma.student.findMany({
    where: { tenantId: tenant.id, enrollments: { some: { academicYear: { isActive: true } } } },
    select: { id: true, darsStudentId: true, customAnswers: true },
  });

  const updates: { id: string; ca: Prisma.InputJsonValue }[] = [];
  for (const s of studs) {
    const did = Number(s.darsStudentId);
    const v = did ? byDars.get(did) : undefined;
    if (v == null) continue; // no Dars answer → leave quitter_seul absent

    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    ca.quitter_seul = v; // flat stable consent
    let reg: Record<string, Record<string, string>> = {};
    if (typeof ca.registration_by_year === "string") {
      try {
        reg = JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>;
      } catch {
        reg = {};
      }
    }
    reg[YEAR] = { ...(reg[YEAR] ?? {}), quitter_seul: v };
    ca.registration_by_year = JSON.stringify(reg);
    updates.push({ id: s.id, ca: ca as Prisma.InputJsonValue });
  }
  console.log(
    `Élèves année active avec réponse Dars: ${updates.length} (les autres restent "-", non modifiés)`,
  );

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
    await prisma.$disconnect();
    await closeDars();
    return;
  }
  let done = 0;
  for (const u of updates) {
    await prisma.student.update({ where: { id: u.id }, data: { customAnswers: u.ca } });
    if (++done % 100 === 0) console.log(`  …${done}`);
  }
  console.log(`\n✓ ${done} élèves — quitter seul importé pour ${YEAR}.`);
  await prisma.$disconnect();
  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
