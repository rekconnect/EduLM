/**
 * Read-only: which students actually have 2025-2026 authorizations in the data
 * (registration_by_year["2025-2026"] carries auth_*), and what the fiche would
 * show. Helps tell "missing data" apart from a display bug.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { firstName: true, lastName: true, family: { select: { code: true } }, customAnswers: true },
  });

  let with2026Auth = 0;
  let withSingleAuth = 0;
  const samples: string[] = [];
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const single =
      ["auth_site", "auth_livre", "auth_reseaux", "auth_radio"].some(
        (k) => typeof ca[k] === "string" && ca[k] !== "",
      );
    if (single) withSingleAuth++;
    let reg2026: Record<string, string> | undefined;
    try {
      const m = typeof ca.registration_by_year === "string"
        ? (JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>)
        : {};
      reg2026 = m["2025-2026"];
    } catch {
      /* ignore */
    }
    const hasReg2026Auth = reg2026 && ["auth_site", "auth_livre", "auth_reseaux", "auth_radio"].some((k) => reg2026![k]);
    if (hasReg2026Auth) {
      with2026Auth++;
      if (samples.length < 8) {
        samples.push(
          `${s.firstName} ${s.lastName} [${s.family?.code ?? "—"}]: 2025-2026 reg = site:${reg2026!.auth_site ?? "-"} livre:${reg2026!.auth_livre ?? "-"} reseaux:${reg2026!.auth_reseaux ?? "-"} radio:${reg2026!.auth_radio ?? "-"}`,
        );
      }
    }
  }
  console.log(`Students with 2025-2026 auth in registration_by_year: ${with2026Auth}`);
  console.log(`Students with any single-value auth set: ${withSingleAuth}`);
  console.log("\nSamples (these SHOULD show their auth for 2025-2026 in the fiche):");
  for (const s of samples) console.log("  " + s);

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
