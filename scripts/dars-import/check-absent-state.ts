/** Read-only: current bus_periods + fiche transport state for a few of the
 *  "absent from Excel" students (Matteo Kassis, Jamati, Challita Thalia...). */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
const prisma = new PrismaClient();
const NAMES: Array<[string, string]> = [
  ["Matteo", "Kassis"],
  ["", "Jamati"],
  ["Thalia", "Challita"],
  ["Kyle", "Bou Dib"],
  ["Tara", "Manoukian"],
];
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  for (const [first, last] of NAMES) {
    const st = await prisma.student.findFirst({
      where: {
        tenantId: tenant.id,
        ...(first ? { firstName: { contains: first, mode: "insensitive" } } : {}),
        lastName: { contains: last, mode: "insensitive" },
      },
      select: { firstName: true, lastName: true, customAnswers: true },
    });
    if (!st) continue;
    const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)["2025-2026|T3"];
    } catch { /* */ }
    let reg: Record<string, string> = {};
    try {
      reg = (JSON.parse(String(ca.registration_by_year ?? "{}")) as Record<string, Record<string, string>>)["2025-2026"] ?? {};
    } catch { /* */ }
    console.log(
      `${st.lastName} ${st.firstName}: période[as=${p?.as || "-"} rs=${p?.rs || "-"} bus ${p?.car_matin || "-"}/${p?.car_soir || "-"}] · fiche[autocar=${reg.autocar ?? "-"} aller=${reg.transport_aller ?? "-"} retour=${reg.transport_retour ?? "-"}]`,
    );
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
