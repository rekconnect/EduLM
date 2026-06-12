/** Read-only: EduLM transport totals after the v54 sync (UI semantics). */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  let count = 0, as = 0, rs = 0, brut = 0, net = 0, remises = 0, zoned = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { /* ignore */ }
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    count++;
    if (p.as === "yes") as++;
    if (p.rs === "yes") rs++;
    brut += Number(p.montant) || 0;
    net += (p.net ?? "").trim() !== "" ? Number(p.net) || 0 : Number(p.montant) || 0;
    if (Number(p.remise) > 0) remises++;
    if ((p.zoneno_matin ?? "").trim() || (p.zoneno_soir ?? "").trim()) zoned++;
  }
  console.log(`EduLM ${PERIOD}: inscrits ${count} · aller ${as} · retour ${rs}`);
  console.log(`brut $${brut.toLocaleString("en-US")} · net $${net.toLocaleString("en-US")} · remises ${remises} · avec n° de zone ${zoned}`);
  console.log("(Dashboard Dars: 507 facturés · brut $162,705 · net $155,960 — EduLM garde en plus les retours d'activité à $0)");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
