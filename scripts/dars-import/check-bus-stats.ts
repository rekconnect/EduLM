/**
 * Read-only: EduLM bus stats for 2025-2026|T3 vs the Dars dashboard numbers
 * (507 inscrits, 373 aller, 477 retour, $155,960). Also shows how many
 * assigned students the page's "registered" detection would HIDE.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";
const YEAR = "2025-2026";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { academicYear: { label: YEAR } } },
    },
    select: { firstName: true, lastName: true, status: true, customAnswers: true },
  });
  const byStatus = new Map<string, number>();

  let withPeriod = 0;
  let asTotal = 0;
  let rsTotal = 0;
  let ar = 0;
  let arSameBus = 0;
  let montant = 0;
  let paye = 0;
  let registered = 0;
  let hiddenAssigned = 0; // has period data but NOT "registered" by billing/autocar
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let reg = false;
    try {
      const sby = JSON.parse(String(ca.services_by_year ?? "{}")) as Record<string, string>;
      if (String(sby[YEAR] ?? "").includes("Transport")) reg = true;
    } catch { /* ignore */ }
    if (!reg) {
      try {
        const r = JSON.parse(String(ca.registration_by_year ?? "{}")) as Record<string, Record<string, string>>;
        if (r[YEAR]?.autocar === "yes") reg = true;
      } catch { /* ignore */ }
    }
    if (reg) registered++;

    let p: Record<string, string> | undefined;
    try {
      const periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
      p = periods[PERIOD];
    } catch { /* ignore */ }
    if (!p) continue;
    const as = p.as === "yes";
    const rs = p.rs === "yes";
    if (as || rs) {
      withPeriod++;
      if (!reg) hiddenAssigned++;
      byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
    }
    if (as) asTotal++;
    if (rs) rsTotal++;
    if (as && rs) {
      ar++;
      if ((p.car_matin ?? "").trim() === (p.car_soir ?? "").trim()) arSameBus++;
    }
    montant += Number(p.montant) || 0;
    paye += Number(p.paye) || 0;
  }

  console.log(`Dars dashboard:   inscrits=507  aller=373  retour=477  montant=$155,960`);
  console.log(`EduLM ${PERIOD}:`);
  console.log(`  with assignment (as/rs): ${withPeriod}`);
  console.log(`  AS total=${asTotal}  RS total=${rsTotal}  AR(both)=${ar}  AR même bus=${arSameBus}  AS+RS 2 bus=${ar - arSameBus}`);
  console.log(`  montant=$${montant.toLocaleString("en-US")}  payé=$${paye.toLocaleString("en-US")}`);
  console.log(`  page "registered" detection: ${registered}`);
  console.log(`  assigned but HIDDEN by detection: ${hiddenAssigned}`);
  console.log(`  assigned by student status:`, Object.fromEntries(byStatus));
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
