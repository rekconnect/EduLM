/**
 * Seed the /transport "Zone" field from Dars' historical BusDetails free text
 * ("Aller-Retour/ Bsalim/ 13/ 474/" → zone "Bsalim"). Uses each student's most
 * recent non-empty BusDetails (SYear desc). Only fills bus_zone when EMPTY in
 * EduLM — never overwrites what the bus admin already typed.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/seed-bus-zones.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

/** "Aller-Retour/ Bsalim/ 13/ 474/" → "Bsalim" (2nd segment), cleaned. */
function zoneFrom(details: string): string {
  const parts = details.split("/").map((p) => p.trim());
  const z = parts[1] ?? "";
  if (!z) return "";
  // Normalize: collapse spaces, capitalize first letter of each word.
  return z
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT sc.ID_Student, sc.SYear, sc.BusDetails
     FROM Isc_StudentClass sc
     WHERE sc.Id_College=${C} AND sc.BusDetails IS NOT NULL AND LTRIM(RTRIM(sc.BusDetails)) <> ''`,
  );
  // Most recent BusDetails per student.
  const latest = new Map<number, { sy: number; details: string }>();
  for (const r of rows) {
    const sid = Number(r.ID_Student);
    const sy = Number(r.SYear);
    const cur = latest.get(sid);
    if (!cur || sy > cur.sy) latest.set(sid, { sy, details: String(r.BusDetails) });
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { in: [...latest.keys()] } },
    select: { id: true, darsStudentId: true, firstName: true, lastName: true, customAnswers: true },
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  let alreadySet = 0;
  let noZone = 0;
  for (const s of students) {
    const src = latest.get(Number(s.darsStudentId));
    if (!src) continue;
    const zone = zoneFrom(src.details);
    if (!zone) {
      noZone++;
      continue;
    }
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    if (typeof ca.bus_zone === "string" && ca.bus_zone.trim()) {
      alreadySet++;
      continue;
    }
    ca.bus_zone = zone;
    updates.push({ id: s.id, ca, label: `${s.lastName} ${s.firstName} → ${zone} (de ${src.sy - 1}-${src.sy})` });
  }

  console.log(`Dars students with BusDetails: ${latest.size}`);
  console.log(`Zones to seed: ${updates.length} · already set in EduLM: ${alreadySet} · details without locality: ${noZone}`);
  for (const u of updates.slice(0, 15)) console.log(`   • ${u.label}`);
  if (updates.length > 15) console.log(`   … +${updates.length - 15} more`);

  if (!CONFIRM) {
    console.log("\nDry-run. Re-run with --confirm to write.");
    await prisma.$disconnect();
    await closeDars();
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
  console.log(`✓ Seeded ${done} zones.`);
  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
