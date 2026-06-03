/**
 * Resolve the EduLM target tenant for a Dars import. Refuses to run
 * unless --tenant-name is passed AND matches exactly one tenant — same
 * guardrail as the wipe scripts. Never auto-picks.
 */
import type { PrismaClient } from "@prisma/client";

export type ImportFlags = {
  tenantName: string;
  confirm: boolean;
};

/** Parse argv for --tenant-name="..." and --confirm. */
export function parseFlags(): ImportFlags {
  const argv = process.argv.slice(2);
  const nameArg = argv.find((a) => a.startsWith("--tenant-name="));
  const tenantName = nameArg ? nameArg.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
  const confirm = argv.includes("--confirm");
  return { tenantName, confirm };
}

export async function resolveTenant(
  prisma: PrismaClient,
  tenantName: string,
): Promise<{ id: string; name: string }> {
  if (!tenantName) {
    console.error(
      'Refusing to run without an explicit tenant. Pass --tenant-name="Lycée Montaigne".',
    );
    process.exit(1);
  }
  const all = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  const q = tenantName.toLowerCase();
  const matches = all.filter((t) => t.name.toLowerCase().includes(q));
  if (matches.length !== 1) {
    console.error(
      `Tenant name "${tenantName}" matched ${matches.length} tenants. Refine. Aborting.`,
    );
    console.error("Tenants in DB:");
    for (const t of all) console.error(`  • ${t.name} (${t.slug})`);
    process.exit(1);
  }
  const target = matches[0]!;
  console.log(`✓ Target tenant: ${target.name} (${target.id})`);
  return target;
}
