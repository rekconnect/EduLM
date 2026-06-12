/**
 * Targeted fix (user-validated against the Dars liste): Sahyoun Giorgio
 * (Elias), MS/A, code S0064 — RS bus 8, pas de zone, quartier "Beit El-Kekko",
 * station "n.4 Imm.n.44". The import had mangled the quartier/station split.
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, lastName: { contains: "Sahyoun", mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });
  const giorgios = students.filter((s) => /giorgio/i.test(s.firstName));
  const target = giorgios.length === 1 ? giorgios[0] : undefined;
  if (!target) {
    console.error("Aucun élève Sahyoun avec code S0064. Candidats:");
    for (const s of students) {
      const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
      console.error(`  • ${s.lastName} ${s.firstName} [${ca.dars_student_code ?? "—"}]`);
    }
    process.exit(1);
  }

  const ca = { ...(target.customAnswers as Record<string, unknown>) };
  const periods = JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>;
  const p = periods[PERIOD];
  if (!p) {
    console.error(`Pas d'entrée ${PERIOD} pour ${target.lastName} ${target.firstName}.`);
    process.exit(1);
  }
  console.log(`Avant: ${target.lastName} ${target.firstName} —`, JSON.stringify(p, null, 2));

  p.zoneno_soir = ""; // zone 0 dans Dars = pas de zone
  p.zone_soir = "Beit El-Kekko";
  p.station_soir = "n.4 Imm.n.44";
  periods[PERIOD] = p;
  ca.bus_periods = JSON.stringify(periods);

  console.log(`\nAprès: zone_soir="Beit El-Kekko" · station_soir="n.4 Imm.n.44" · zoneno_soir=""`);
  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    await prisma.student.update({
      where: { id: target.id },
      data: { customAnswers: ca as Prisma.InputJsonValue },
    });
    console.log("\n✓ Corrigé.");
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
