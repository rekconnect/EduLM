/**
 * Read-only: dump the live Tenant.parentFieldsConfig field keys so we can see
 * exactly which parent fields are installed (e.g. is `actuel` present yet?).
 *   npx tsx scripts/dars-import/check-parent-config.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { parentFieldsConfig: true },
  });
  const cfg = (t?.parentFieldsConfig ?? {}) as {
    fields?: Array<{ key?: string; label?: string }>;
  };
  const fields = cfg.fields ?? [];
  console.log(`Parent config has ${fields.length} fields.`);
  console.log("Keys:", fields.map((f) => f.key).join(", "));
  console.log("\nCheck specific keys:");
  for (const k of [
    "decede",
    "second_mariage",
    "actuel",
    "auth_site",
    "auth_livre",
    "auth_reseaux",
    "auth_radio",
  ]) {
    const f = fields.find((x) => x.key === k);
    console.log(`  ${k}: ${f ? `PRESENT (label="${f.label}")` : "ABSENT"}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
