/** Read-only: how many students actually have email_eleve / email_college /
 *  portable_eleve populated, with a few samples. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  const keys = ["communaute_eleve", "numero_identite"];
  const counts: Record<string, number> = {};
  const samples: Record<string, string[]> = {};
  for (const k of keys) { counts[k] = 0; samples[k] = []; }
  // Authorization keys live inside registration_by_year[year].
  const regKeys = ["quitter_seul", "auth_site", "auth_livre", "auth_reseaux", "auth_radio"];
  const regCounts: Record<string, number> = {};
  for (const k of regKeys) regCounts[k] = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    for (const k of keys) {
      const v = typeof ca[k] === "string" ? (ca[k] as string).trim() : "";
      if (v) {
        counts[k]!++;
        if (samples[k]!.length < 4) samples[k]!.push(`${s.lastName} ${s.firstName}: ${v}`);
      }
    }
  }
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let reg: Record<string, Record<string, string>> = {};
    try { reg = JSON.parse(String(ca.registration_by_year ?? "{}")) as Record<string, Record<string, string>>; } catch { /* ignore */ }
    const seen = new Set<string>();
    for (const y of Object.values(reg)) for (const k of regKeys) if ((y[k] ?? "").trim()) seen.add(k);
    for (const k of seen) regCounts[k]!++;
  }
  console.log(`Total students: ${students.length}`);
  console.log(`\nregistration_by_year authorization keys (students with a value in any year):`);
  for (const k of regKeys) console.log(`  ${k}: ${regCounts[k]}`);
  for (const k of keys) {
    console.log(`\n${k}: ${counts[k]} populated`);
    for (const x of samples[k]!) console.log(`   ${x}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
