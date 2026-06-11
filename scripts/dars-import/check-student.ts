/**
 * Read-only: full per-year picture for one student (auth / collation / bus),
 * showing the EXACT source each display value derives from. Pass --first / --last.
 *   npx tsx scripts/dars-import/check-student.ts --tenant-name="..." --last="Abboud" --first="Oliver"
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const AUTH = ["auth_site", "auth_livre", "auth_reseaux", "auth_radio"];
const COLLATION_LEVELS = new Set([
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
]);
const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};
const s = (ca: Record<string, unknown>, k: string) =>
  typeof ca[k] === "string" ? (ca[k] as string) : "—";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const last = arg("last") || "Abboud";
  const first = arg("first");
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      lastName: { contains: last, mode: "insensitive" },
      ...(first ? { firstName: { contains: first, mode: "insensitive" } } : {}),
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
    try { billing = JSON.parse(s(ca, "services_by_year")); } catch { /* */ }
    let reg: Record<string, Record<string, string>> = {};
    try { reg = JSON.parse(s(ca, "registration_by_year")); } catch { /* */ }

    for (const e of st.enrollments) {
      const yr = e.academicYear.label;
      const lvl = e.class.level;
      const bill = billing[yr] ?? "";
      const r = reg[yr] ?? {};
      // Replicate StudentYearView collation rule (enrolled year) — accounting
      // list is the source; no maternelle override.
      let collation: string;
      if (!COLLATION_LEVELS.has(lvl)) collation = "Non (collège, après CM2)";
      else collation = bill.includes("Collation")
        ? "Oui (sur la liste compta)"
        : "Non (hors liste)";
      console.log(
        `  ${yr} ${e.class.name} (${lvl}): COLLATION → ${collation}` +
        `\n       billing="${bill}"  reg.collations=${r.collations ?? "-"}  arabe=${r.arabe_langue ?? "-"}` +
        `  reg.auth=[${AUTH.map((k) => r[k] ?? "-").join(",")}]`,
      );
    }
    // future / non-enrolled reg years
    for (const [yr, r] of Object.entries(reg)) {
      if (st.enrollments.some((e) => e.academicYear.label === yr)) continue;
      console.log(
        `  ${yr} (non inscrit): COLLATION → ${r.collations === "yes" ? "Oui (reg.collations=yes)" : r.collations === "no" ? "Non" : "—"}` +
        `  reg.collations=${r.collations ?? "-"}  arabe=${r.arabe_langue ?? "-"}`,
      );
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
