/** Read-only: every T3 direction flagged "activité", with class/bus/quartier. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: {
      firstName: true, lastName: true, customAnswers: true,
      enrollments: {
        where: { academicYear: { label: "2025-2026" } },
        select: { class: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const out: string[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let p: Record<string, string> | undefined;
    try {
      p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)[PERIOD];
    } catch { continue; }
    if (!p) continue;
    const cls = s.enrollments[0]?.class.name ?? "—";
    const parts: string[] = [];
    if (p.as === "yes" && p.activite_matin === "yes")
      parts.push(`ALLER matin (bus ${p.car_matin || "—"} · ${p.zone_matin || "—"})`);
    if (p.rs === "yes" && p.activite_soir === "yes")
      parts.push(`RETOUR soir (bus ${p.car_soir || "—"} · ${p.zone_soir || "—"})`);
    if (parts.length) out.push(`${s.lastName} ${s.firstName} (${cls}) — ${parts.join(" + ")}`);
  }
  console.log(`${out.length} élèves avec trajet(s) d'activité:`);
  for (const l of out) console.log(`  • ${l}`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
