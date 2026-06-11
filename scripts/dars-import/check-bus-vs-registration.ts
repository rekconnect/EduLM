/**
 * Read-only: for a few students, compare (a) the REGISTRATION transport intent
 * (Isc_ModifStudents → registration_by_year transport_aller/retour) with
 * (b) the imported bus assignment flags (bus_as / bus_rs from the car
 * manifests). Surfaces Dars-internal inconsistencies (registered morning-only
 * but listed AR on a car sheet).
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const NAMES: Array<[string, string]> = [
  ["Alessa", "Habib"],
  ["Andrew", "Murr"],
  ["Thalia", "Challita"],
  ["Yasmina", "Abou Rahal"],
];

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  for (const [first, last] of NAMES) {
    const st = await prisma.student.findFirst({
      where: {
        tenantId: tenant.id,
        firstName: { contains: first, mode: "insensitive" },
        lastName: { contains: last, mode: "insensitive" },
      },
      select: { firstName: true, lastName: true, customAnswers: true },
    });
    if (!st) {
      console.log(`\n=== ${first} ${last}: not found`);
      continue;
    }
    const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`\n=== ${st.firstName} ${st.lastName} ===`);
    console.log(
      `  bus flags: AS=${ca.bus_as || "-"} RS=${ca.bus_rs || "-"} · matin[bus ${ca.bus_car_matin || "-"}] soir[bus ${ca.bus_car_soir || "-"}]`,
    );
    try {
      const reg = JSON.parse(String(ca.registration_by_year ?? "{}")) as Record<
        string,
        Record<string, string>
      >;
      for (const [yr, r] of Object.entries(reg)) {
        if (!r.autocar && !r.transport_aller && !r.transport_retour) continue;
        console.log(
          `  registration ${yr}: autocar=${r.autocar ?? "-"} aller=${r.transport_aller ?? "-"} retour=${r.transport_retour ?? "-"}`,
        );
      }
    } catch {
      /* ignore */
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
