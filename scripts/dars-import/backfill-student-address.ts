/**
 * Mirror each student's residential address from their Family onto the
 * Student.address/city/postalCode/country columns (which the student
 * detail form reads). Dars stored the address at the family level; this
 * copies it down so it shows on every student.
 *
 * Idempotent. DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/backfill-student-address.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/backfill-student-address.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, familyId: { not: null } },
    select: {
      id: true,
      address: true,
      city: true,
      family: {
        select: {
          addressStreet: true,
          addressHood: true,
          addressPostal: true,
          addressCity: true,
          addressCountry: true,
        },
      },
    },
  });

  const updates = students
    .map((s) => {
      const f = s.family;
      if (!f) return null;
      // address = street (+ quartier when it adds info)
      const parts = [f.addressStreet, f.addressHood].filter(
        (x): x is string => !!x && x.trim().length > 0,
      );
      const address = parts.length ? [...new Set(parts)].join(", ") : null;
      const city = f.addressCity || null;
      const postalCode = f.addressPostal || null;
      const country = f.addressCountry || "Liban";
      if (!address && !city && !postalCode) return null;
      return { id: s.id, address, city, postalCode, country };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  console.log(`Students with a family: ${students.length}`);
  console.log(`Students that will get an address: ${updates.length}`);
  console.log("Sample:", JSON.stringify(updates.slice(0, 3), null, 1));

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const size = 10;
  for (let i = 0; i < updates.length; i += size) {
    const slice = updates.slice(i, i + size);
    await Promise.all(
      slice.map((u) =>
        prisma.student.update({
          where: { id: u.id },
          data: { address: u.address, city: u.city, postalCode: u.postalCode, country: u.country },
        }),
      ),
    );
    done += slice.length;
    process.stdout.write(`\r  updated: ${done}/${updates.length}`);
  }
  process.stdout.write("\n✓ Student addresses mirrored from families.\n");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
