/**
 * One-time backfill before merging the "Identité" and "Info générale" tabs:
 * copy the imported custom answers into the built-in Student columns where
 * those are still empty, so hiding the duplicated custom fields loses nothing:
 *   customAnswers.nationalite     → Student.nationality
 *   customAnswers.lieu_naissance  → Student.placeOfBirth
 * DRY-RUN by default; --confirm to write.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nationality: true,
      placeOfBirth: true,
      customAnswers: true,
    },
  });

  const updates: Array<{ id: string; data: Record<string, string>; label: string }> = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const nat = typeof ca.nationalite === "string" ? ca.nationalite.trim() : "";
    const lieu = typeof ca.lieu_naissance === "string" ? ca.lieu_naissance.trim() : "";
    const data: Record<string, string> = {};
    if (nat && !(s.nationality ?? "").trim()) data.nationality = nat.slice(0, 80);
    if (lieu && !(s.placeOfBirth ?? "").trim()) data.placeOfBirth = lieu.slice(0, 120);
    if (Object.keys(data).length === 0) continue;
    updates.push({
      id: s.id,
      data,
      label: `${s.lastName} ${s.firstName}: ${Object.entries(data).map(([k, v]) => `${k}="${v}"`).join(" ")}`,
    });
  }
  console.log(`Students to backfill: ${updates.length} / ${students.length}`);
  for (const u of updates.slice(0, 8)) console.log(`   • ${u.label}`);
  if (updates.length > 8) console.log(`   … +${updates.length - 8}`);

  if (!CONFIRM) {
    console.log("\n🟡 DRY-RUN — re-run with --confirm to write.");
    await prisma.$disconnect();
    return;
  }
  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) => prisma.student.update({ where: { id: u.id }, data: u.data })),
        );
        done += chunk.length;
        break;
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    if (done % 250 < 5) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`✓ Backfilled ${done} students.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
