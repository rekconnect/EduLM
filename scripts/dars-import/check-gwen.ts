/**
 * Read-only: full per-year picture for one student so we can say exactly what
 * the fiche SHOULD show for authorizations, collation and bus. Defaults to
 * Gwen Abbosh.
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
      lastName: { contains: "Abbosh", mode: "insensitive" },
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
  for (const st of students) {
    const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`\n=== ${st.firstName} ${st.lastName} ===`);

    let billing: Record<string, string> = {};
    try {
      billing = JSON.parse(s(ca, "services_by_year"));
    } catch {
      /* ignore */
    }

    console.log("Enrolled years (parcours) + billing services:");
    for (const e of st.enrollments)
      console.log(
        `  ${e.academicYear.label}: ${e.class.name} (${e.class.level}) · billing=${billing[e.academicYear.label] ?? "—"}`,
      );

    console.log("Single-value:");
    console.log(
      `  autocar=${s(ca, "autocar")} aller=${s(ca, "transport_aller")} retour=${s(ca, "transport_retour")} collations=${s(ca, "collations")} repas_chaud=${s(ca, "repas_chaud")}`,
    );
    console.log(
      `  ${AUTH.map((k) => `${k}=${s(ca, k)}`).join("  ")}`,
    );

    console.log("registration_by_year:");
    try {
      const m = JSON.parse(s(ca, "registration_by_year")) as Record<
        string,
        Record<string, string>
      >;
      for (const [yr, r] of Object.entries(m)) {
        console.log(
          `  ${yr}: autocar=${r.autocar ?? "-"} aller=${r.transport_aller ?? "-"} retour=${r.transport_retour ?? "-"} collations=${r.collations ?? "-"} repas=${r.repas_chaud ?? "-"}`,
        );
        console.log(
          `         ${AUTH.map((k) => `${k}=${r[k] ?? "-"}`).join("  ")}`,
        );
      }
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
