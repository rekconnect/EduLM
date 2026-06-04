/**
 * Fix Family.addressStreet — the base importer mashed Street+Building+Floor
 * into it. Reset to the Dars Street ONLY (Building/Floor already live in
 * their own custom fields adresse_immeuble / adresse_etage).
 *
 * DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/fix-address-street.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/fix-address-street.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const clean = (s?: string | null) => {
  const v = (s ?? "").toString().trim();
  return v === "--" || v === "" ? null : v;
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const families = await prisma.family.findMany({
    where: { tenantId: tenant.id, darsRootParentId: { not: null } },
    select: { id: true, code: true, addressStreet: true, darsRootParentId: true },
  });
  const rootIds = families.map((f) => Number(f.darsRootParentId));

  // root parent → Id_Address
  const parents = await darsQuery<{ ID_Parent: number; Id_Address: number | null }>(
    `SELECT ID_Parent, Id_Address FROM Isc_Parent WHERE Id_College=${C} AND ID_Parent IN (${rootIds.join(",") || "-1"})`,
  );
  const addrByRoot = new Map<number, number>();
  for (const p of parents) if (p.Id_Address) addrByRoot.set(Number(p.ID_Parent), Number(p.Id_Address));

  const addrIds = [...new Set([...addrByRoot.values()])];
  const addresses = addrIds.length
    ? await darsQuery<{ ID: number; Street: string | null }>(
        `SELECT ID, Street FROM Isc_Address WHERE Id_College=${C} AND ID IN (${addrIds.join(",")})`,
      )
    : [];
  const streetByAddr = new Map<number, string | null>();
  for (const a of addresses) streetByAddr.set(Number(a.ID), clean(a.Street));

  const plan: Array<{ id: string; from: string | null; to: string | null }> = [];
  for (const f of families) {
    const addrId = addrByRoot.get(Number(f.darsRootParentId));
    const street = addrId != null ? (streetByAddr.get(addrId) ?? null) : null;
    if (f.addressStreet !== street) plan.push({ id: f.id, from: f.addressStreet, to: street });
  }

  console.log(`Families: ${families.length}`);
  console.log(`Will fix addressStreet: ${plan.length}`);
  console.log("Sample:", JSON.stringify(plan.slice(0, 6), null, 1));

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < plan.length; i += 10) {
    await Promise.all(
      plan.slice(i, i + 10).map((p) => prisma.family.update({ where: { id: p.id }, data: { addressStreet: p.to } })),
    );
    done += Math.min(10, plan.length - i);
    process.stdout.write(`\r  fixed: ${done}/${plan.length}`);
  }
  process.stdout.write("\n✓ addressStreet now holds the street only.\n");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
