/**
 * Bulk-enable imported parents with a shared initial password and force a
 * password change on first login.
 *
 * Targets CURRENT parents only — those with at least one currently-
 * ENROLLED child — with a REAL email (placeholder
 * @import.lyceemontaigne.local accounts are skipped; you can't tell those
 * parents their login). Parents whose children have all left/graduated
 * are NOT enabled. Sets:
 *   passwordHash = bcrypt(default)   (one hash reused for all — same pwd)
 *   status = ACTIVE                  (so they can sign in)
 *   mustChangePassword = true        (forced change on first login)
 *
 * DRY RUN by default. Pass --confirm to apply.
 *
 *   npx tsx scripts/dars-import/enable-parents.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/enable-parents.ts --tenant-name="Lycée Montaigne" --confirm
 *   (optional) --password="Montaigne2026"
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const PLACEHOLDER_DOMAIN = "@import.lyceemontaigne.local";

async function main() {
  const { tenantName, confirm } = parseFlags();
  const pwArg = process.argv.find((a) => a.startsWith("--password="));
  const defaultPassword = pwArg
    ? pwArg.split("=").slice(1).join("=").replace(/^["']|["']$/g, "")
    : "Montaigne2026";

  const tenant = await resolveTenant(prisma, tenantName);

  // CURRENT parents only: must have at least one ENROLLED child. This
  // excludes the ~800 historical parents whose kids have all left.
  const currentParent = {
    tenantId: tenant.id,
    role: "PARENT" as const,
    darsParentId: { not: null },
    guardianProfile: {
      childLinks: { some: { student: { status: "ENROLLED" as const } } },
    },
  };

  const where = {
    ...currentParent,
    NOT: { email: { endsWith: PLACEHOLDER_DOMAIN } },
  };

  const target = await prisma.user.count({ where });
  const placeholder = await prisma.user.count({
    where: { ...currentParent, email: { endsWith: PLACEHOLDER_DOMAIN } },
  });
  const historical = await prisma.user.count({
    where: {
      tenantId: tenant.id,
      role: "PARENT",
      darsParentId: { not: null },
      NOT: {
        guardianProfile: {
          childLinks: { some: { student: { status: "ENROLLED" } } },
        },
      },
    },
  });

  console.log(`Initial password: "${defaultPassword}"`);
  console.log(`CURRENT parents to enable (enrolled child + real email): ${target}`);
  console.log(`Skipped — current but placeholder email:                 ${placeholder}`);
  console.log(`Skipped — historical (no enrolled child):                ${historical}`);

  const sample = await prisma.user.findMany({
    where,
    take: 5,
    select: { email: true, firstName: true, lastName: true, status: true },
  });
  console.log("Sample:", JSON.stringify(sample));

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  // One bcrypt hash, reused for all — they share the same temporary
  // password anyway, and it's force-changed on first login. Avoids
  // hashing 1,894 times.
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const res = await prisma.user.updateMany({
    where,
    data: { passwordHash, status: "ACTIVE", mustChangePassword: true },
  });

  console.log(`\n✓ Enabled ${res.count} parents.`);
  console.log(`  They sign in with their email + "${defaultPassword}",`);
  console.log(`  then are forced to choose a new password.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
