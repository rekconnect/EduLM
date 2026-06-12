/** Read-only: list every distinct quartier stored in bus_periods (matin+soir)
 *  with counts — to spot other mangled splits like "Beit El" / "Kekko, …". */
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
  const counts = new Map<string, { n: number; ex: string }>();
  const suspicious: string[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let periods: Record<string, Record<string, string>> = {};
    try {
      periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
    } catch { continue; }
    for (const [key, p] of Object.entries(periods)) {
      for (const dir of ["matin", "soir"] as const) {
        const z = (p[`zone_${dir}`] ?? "").trim();
        if (!z) continue;
        const c = counts.get(z) ?? { n: 0, ex: "" };
        c.n++;
        c.ex = `${s.lastName} ${s.firstName} (${key} ${dir})`;
        counts.set(z, c);
        const st = (p[`station_${dir}`] ?? "").trim();
        // A station starting lowercase-word + comma right after a short zone
        // suggests the comma-split landed inside the quartier name.
        if (/,/.test(st.slice(0, 18)) && z.split(" ").length <= 2 && /\b(el|al|beit|deir|ain)$/i.test(z)) {
          suspicious.push(`${s.lastName} ${s.firstName} — zone "${z}" · station "${st}" (${key} ${dir})`);
        }
      }
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${sorted.length} quartiers distincts:`);
  for (const [z, c] of sorted) console.log(`  ${String(c.n).padStart(3)} × ${z}${c.n <= 2 ? `   ← ex: ${c.ex}` : ""}`);
  console.log(`\nSuspects (split au milieu du nom): ${suspicious.length}`);
  for (const s of suspicious) console.log(`  ! ${s}`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
