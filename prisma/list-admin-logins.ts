/**
 * List every admin login per tenant — handy when you can't remember
 * which email you used to set up a school.
 *
 * Run:
 *   npx tsx prisma/list-admin-logins.ts
 *
 * Read-only. Never writes anything.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  for (const t of tenants) {
    const admins = await prisma.user.findMany({
      where: { tenantId: t.id, role: "SCHOOL_ADMIN" },
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });
    console.log(`\n${t.name}  (slug: ${t.slug})  [${admins.length} admin]`);
    if (admins.length === 0) {
      console.log("  (no admin user)");
      continue;
    }
    for (const a of admins) {
      const label =
        [a.firstName, a.lastName].filter(Boolean).join(" ") ||
        a.name ||
        "(no name)";
      console.log(
        `  • ${a.email}  —  ${label}  [${a.status}]  created ${a.createdAt.toISOString().slice(0, 10)}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
