/**
 * Switch a tenant's NEW-family code format to plain Dars-style numbers:
 *   familyCodePrefix = ""   (no prefix)
 *   familyCodePadding = 0   (no zero-padding)
 *   familyCodeNextSequence = max existing numeric family code + 1
 *
 * Existing families keep their codes; this only affects families created from
 * now on. Dry-run by default; pass --confirm to write.
 *
 * Usage:
 *   DATABASE_URL=$DIRECT_URL node scripts/dars-import/set-family-code-plain.cjs --tenant-name="Lycée Montaigne" [--confirm]
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}
const CONFIRM = process.argv.includes("--confirm");
const TENANT_NAME = arg("tenant-name", "Lycée Montaigne");

(async () => {
  const t = await prisma.tenant.findFirst({
    where: { name: TENANT_NAME },
    select: {
      id: true,
      name: true,
      familyCodePrefix: true,
      familyCodePadding: true,
      familyCodeNextSequence: true,
    },
  });
  if (!t) {
    console.error(`Tenant "${TENANT_NAME}" not found`);
    process.exit(1);
  }

  const fams = await prisma.family.findMany({
    where: { tenantId: t.id },
    select: { code: true },
  });
  const nums = fams
    .map((f) => Number(f.code))
    .filter((n) => Number.isInteger(n) && n >= 0);
  const maxNum = nums.length ? Math.max(...nums) : 0;
  const nextSeq = maxNum + 1;

  console.log(`Tenant: ${t.name} (${t.id})`);
  console.log(`  families: ${fams.length} (numeric: ${nums.length}, max: ${maxNum})`);
  console.log("  CURRENT:", {
    prefix: t.familyCodePrefix,
    padding: t.familyCodePadding,
    nextSequence: t.familyCodeNextSequence,
  });
  console.log("  PROPOSED:", { prefix: "", padding: 0, nextSequence: nextSeq });
  console.log(`  → next new family code will be "${nextSeq}", then "${nextSeq + 1}", …`);

  if (!CONFIRM) {
    console.log("\nDry run. Re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  await prisma.tenant.update({
    where: { id: t.id },
    data: {
      familyCodePrefix: "",
      familyCodePadding: 0,
      familyCodeNextSequence: nextSeq,
    },
  });
  console.log("\n✓ Applied.");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
