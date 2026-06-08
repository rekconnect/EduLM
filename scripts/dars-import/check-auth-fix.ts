/**
 * Read-only: confirm the most-recently-answered single-value auth fix.
 * Counts students with single-value auth set, and shows a few that have auth
 * in their per-year registration.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const val = (ca: Record<string, unknown>, k: string) =>
  typeof ca[k] === "string" ? (ca[k] as string) : "";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, customAnswers: true },
  });

  let singleAuth = 0;
  const samples: string[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const hasSingle =
      val(ca, "auth_site") || val(ca, "auth_livre") || val(ca, "auth_reseaux") || val(ca, "auth_radio");
    if (hasSingle) singleAuth++;
    const reg = val(ca, "registration_by_year");
    if (reg.includes("auth_") && samples.length < 6) {
      samples.push(
        `${s.firstName} ${s.lastName}: single[site=${val(ca, "auth_site") || "—"} livre=${val(ca, "auth_livre") || "—"} reseaux=${val(ca, "auth_reseaux") || "—"} radio=${val(ca, "auth_radio") || "—"}] reg=${reg}`,
      );
    }
  }
  console.log(`Students with a single-value authorization set: ${singleAuth} / ${students.length}`);
  console.log("\nSamples (students with auth in their registration):");
  for (const s of samples) console.log("  " + s);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
