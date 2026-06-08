/**
 * Read-only: compare a student's SINGLE-VALUE auth_* (what the editable
 * "Autorisations" group shows) vs the per-year registration_by_year auth_*
 * (what StudentYearView shows). Confirms the source of the Non-vs-Oui split.
 * Defaults to Alexandre Mattéo Jamati.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const AUTH = ["auth_site", "auth_livre", "auth_reseaux", "auth_radio"];
const s = (ca: Record<string, unknown>, k: string) =>
  typeof ca[k] === "string" ? (ca[k] as string) : "—";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      lastName: { contains: "Jamati", mode: "insensitive" },
    },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  for (const st of students) {
    const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`\n=== ${st.firstName} ${st.lastName} ===`);
    console.log("Single-value (editable group shows these):");
    console.log("  " + AUTH.map((k) => `${k}=${s(ca, k)}`).join("  "));
    console.log("registration_by_year (StudentYearView shows these):");
    try {
      const m = JSON.parse(s(ca, "registration_by_year")) as Record<
        string,
        Record<string, string>
      >;
      for (const [yr, r] of Object.entries(m))
        console.log(
          `  ${yr}: ` + AUTH.map((k) => `${k}=${r[k] ?? "-"}`).join("  "),
        );
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
