/**
 * Fix quartiers mangled by an old import that split "Quartier-Suite, Station"
 * at the hyphen instead of the comma (e.g. "Beit El" + "Kekko, n.4 …").
 * Shows current values, repairs zone/station for the known patterns.
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

// zone as stored → expected station prefix → repaired quartier
const REPAIRS: Array<{ zone: string; stationStart: string; fixedZone: string }> = [
  { zone: "Qornet El", stationStart: "Hamra,", fixedZone: "Qornet El-Hamra" },
  { zone: "Mar Boutros Karm Et", stationStart: "Tine,", fixedZone: "Mar Boutros Karm Et-Tine" },
];

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });

  let fixed = 0;
  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
    } catch { continue; }
    let changed = false;
    for (const [key, p] of Object.entries(periods)) {
      for (const dir of ["matin", "soir"] as const) {
        const z = (p[`zone_${dir}`] ?? "").trim();
        const st = (p[`station_${dir}`] ?? "").trim();
        for (const r of REPAIRS) {
          if (z === r.zone && st.startsWith(r.stationStart)) {
            const newStation = st.slice(r.stationStart.length).trim();
            console.log(`${s.lastName} ${s.firstName} (${key} ${dir}):`);
            console.log(`   zone "${z}" · station "${st}"`);
            console.log(`   → zone "${r.fixedZone}" · station "${newStation}"`);
            p[`zone_${dir}`] = r.fixedZone;
            p[`station_${dir}`] = newStation;
            changed = true;
            fixed++;
          }
        }
      }
    }
    if (changed && confirm) {
      ca.bus_periods = JSON.stringify(periods);
      await prisma.student.update({
        where: { id: s.id },
        data: { customAnswers: ca as Prisma.InputJsonValue },
      });
    }
  }
  console.log(`\n${fixed} champ(s) ${confirm ? "corrigé(s)" : "à corriger (DRY-RUN — relancer avec --confirm)"}`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
