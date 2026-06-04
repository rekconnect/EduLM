/**
 * Re-code imported families from the generated "F-#####" to the real Dars
 * ParentCode (the family/file code staff recognize). Raw format (e.g. 186).
 *
 * Safety:
 *  - Only families with a Dars root + a NON-EMPTY, UNIQUE ParentCode get
 *    re-coded. Blank or duplicated ParentCodes keep their current F- code.
 *  - Idempotent — re-running is safe.
 *
 * DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/recode-family-codes.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/recode-family-codes.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const families = await prisma.family.findMany({
    where: { tenantId: tenant.id, darsRootParentId: { not: null } },
    select: { id: true, code: true, darsRootParentId: true },
  });
  const rootIds = families.map((f) => Number(f.darsRootParentId));

  const dars = await darsQuery<{ ID_Parent: number; ParentCode: string | null }>(
    `SELECT ID_Parent, ParentCode FROM Isc_Parent
     WHERE Id_College = ${C} AND ID_Parent IN (${rootIds.join(",") || "-1"})`,
  );
  const codeByRoot = new Map<number, string>();
  for (const d of dars) {
    const pc = (d.ParentCode ?? "").trim();
    if (pc) codeByRoot.set(Number(d.ID_Parent), pc);
  }

  // Detect duplicate ParentCodes across our families.
  const codeCount = new Map<string, number>();
  for (const f of families) {
    const pc = codeByRoot.get(Number(f.darsRootParentId));
    if (pc) codeCount.set(pc, (codeCount.get(pc) ?? 0) + 1);
  }

  const plan: Array<{ id: string; from: string; to: string }> = [];
  let blank = 0;
  let dup = 0;
  for (const f of families) {
    const pc = codeByRoot.get(Number(f.darsRootParentId));
    if (!pc) {
      blank++;
      continue;
    }
    if ((codeCount.get(pc) ?? 0) > 1) {
      dup++;
      continue;
    }
    if (f.code !== pc) plan.push({ id: f.id, from: f.code, to: pc });
  }

  console.log(`Families with Dars root:      ${families.length}`);
  console.log(`Will re-code to Dars code:    ${plan.length}`);
  console.log(`Kept (blank ParentCode):      ${blank}`);
  console.log(`Kept (duplicate ParentCode):  ${dup}`);
  console.log("Sample:", JSON.stringify(plan.slice(0, 6)));

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < plan.length; i += 10) {
    await Promise.all(
      plan.slice(i, i + 10).map((p) =>
        prisma.family.update({ where: { id: p.id }, data: { code: p.to } }),
      ),
    );
    done += Math.min(10, plan.length - i);
    process.stdout.write(`\r  recoded: ${done}/${plan.length}`);
  }
  process.stdout.write("\n✓ Family codes now match Dars.\n");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
