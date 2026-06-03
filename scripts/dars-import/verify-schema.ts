/**
 * Quick check that the Dars-migration columns landed in BOTH the
 * generated Prisma client and the actual Postgres schema.
 * Run: npx tsx scripts/dars-import/verify-schema.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  // These compile + run only if the new columns exist everywhere.
  const u = await p.user.findFirst({
    where: { darsParentId: { not: null } },
    select: { id: true, darsParentId: true },
  });
  const s = await p.student.findFirst({
    where: { darsStudentId: { not: null } },
    select: { id: true },
  });
  const c = await p.class.findFirst({
    where: { darsClassId: { not: null } },
    select: { id: true },
  });
  const g = await p.guardian.findFirst({
    where: { phone: { not: null } },
    select: { id: true },
  });

  console.log("OK — all 4 new columns exist and are queryable:");
  console.log("  User.darsParentId     ✓");
  console.log("  Student.darsStudentId ✓");
  console.log("  Class.darsClassId     ✓");
  console.log("  Guardian.phone        ✓");
  console.log("");
  console.log("(no imported rows yet, as expected):", { u, s, c, g });
}

main()
  .catch((e) => {
    console.error("FAILED:", String(e).split("\n")[0]);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
