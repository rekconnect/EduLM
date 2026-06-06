/**
 * Remap existing parent customAnswers.type_famille from the raw Dars number
 * ("1".."5") to the proper label, so the new dropdown shows correctly.
 * Merge-only — leaves every other answer untouched.
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const MAP: Record<string, string> = {
  "1": "Ordinaire",
  "2": "Parents Cadrés",
  "3": "Parents Empl",
  "4": "Parents Non-cadrés",
  "5": "Parents boursiers",
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const parents = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: "PARENT", darsParentId: { not: null } },
    select: { id: true, customAnswers: true },
  });

  const todo = parents.filter((p) => {
    const ca = (p.customAnswers ?? {}) as Record<string, unknown>;
    const v = ca.type_famille;
    return typeof v === "string" && v in MAP;
  });
  console.log(`Parents with numeric type_famille to remap: ${todo.length}`);

  if (!confirm) {
    console.log("🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(
      todo.slice(i, i + 10).map((p) => {
        const ca = { ...(p.customAnswers as Record<string, unknown>) };
        ca.type_famille = MAP[ca.type_famille as string];
        return prisma.user.update({ where: { id: p.id }, data: { customAnswers: ca } });
      }),
    );
    done += Math.min(10, todo.length - i);
    process.stdout.write(`\r  remapped: ${done}/${todo.length}`);
  }
  process.stdout.write("\n✓ type_famille labels applied.\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
