/**
 * Targeted correction (confirmed by Raed): Yann ABI HAILA rides bus 11 in the
 * MORNING (AS) and has NO retour — the Dars manifests carried two wrong rows
 * for him (AS car 13 + RS car 11). Updates bus_periods["2025-2026|T3"].
 * DRY-RUN by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const st = await prisma.student.findFirst({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Yann", mode: "insensitive" },
      lastName: { contains: "Abi Haila", mode: "insensitive" },
    },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });
  if (!st) {
    console.error("Yann ABI HAILA not found");
    process.exit(1);
  }
  const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
  const periods =
    typeof ca.bus_periods === "string"
      ? (JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>)
      : {};
  console.log(`${st.firstName} ${st.lastName} — before:`, JSON.stringify(periods[PERIOD] ?? {}));
  periods[PERIOD] = {
    ...(periods[PERIOD] ?? {}),
    as: "yes",
    rs: "",
    car_matin: "11",
    zone_matin: "Bikfaya",
    station_matin: "103 Imm. Abihaila",
    car_soir: "",
    zone_soir: "",
    station_soir: "",
  };
  console.log("after:", JSON.stringify(periods[PERIOD]));
  if (!CONFIRM) {
    console.log("\nDry-run. Re-run with --confirm to write.");
    await prisma.$disconnect();
    return;
  }
  await prisma.student.update({
    where: { id: st.id },
    data: {
      customAnswers: { ...ca, bus_periods: JSON.stringify(periods) } as Prisma.InputJsonValue,
    },
  });
  console.log("✓ Fixed.");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
