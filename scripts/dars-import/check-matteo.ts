/**
 * Read-only: trace one student's transport across years — single-value vs
 * per-year registration + billing — to confirm the year view is consistent.
 * Defaults to Matteo Kassis.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const v = (ca: Record<string, unknown>, k: string) =>
  typeof ca[k] === "string" ? (ca[k] as string) : "—";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Matteo", mode: "insensitive" },
      lastName: { contains: "Kassis", mode: "insensitive" },
    },
    select: {
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        orderBy: { academicYear: { startDate: "desc" } },
        select: {
          academicYear: { select: { label: true } },
          class: { select: { name: true, level: true } },
        },
      },
    },
  });
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`\n=== ${s.firstName} ${s.lastName} ===`);
    console.log("Enrolled years (parcours):");
    for (const e of s.enrollments)
      console.log(`  ${e.academicYear.label}: ${e.class.name} (${e.class.level}) · billing services=${v(ca, "services_by_year")}`);
    console.log("Single-value:");
    console.log(
      `  autocar=${v(ca, "autocar")} aller=${v(ca, "transport_aller")} retour=${v(ca, "transport_retour")} person=${v(ca, "transport_person")}`,
    );
    console.log("registration_by_year:");
    try {
      const m = JSON.parse(v(ca, "registration_by_year")) as Record<string, Record<string, string>>;
      for (const [yr, r] of Object.entries(m))
        console.log(`  ${yr}: autocar=${r.autocar ?? "-"} aller=${r.transport_aller ?? "-"} retour=${r.transport_retour ?? "-"} auth_livre=${r.auth_livre ?? "-"} person=${r.transport_person ?? "-"}`);
    } catch {
      console.log("  (none)");
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
