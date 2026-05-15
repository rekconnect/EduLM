import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const counts = {
    tenants: await p.tenant.count(),
    users: await p.user.count(),
    students: await p.student.count(),
    classes: await p.class.count(),
    enrollments: await p.enrollment.count(),
    guardians: await p.guardian.count(),
  };
  console.log("Counts:", JSON.stringify(counts, null, 2));

  const sami = await p.user.findFirst({
    where: { email: "sami.kassem@example.com" },
    include: { guardianProfile: { include: { childLinks: { include: { student: true } } } } },
  });
  console.log("\nSami's children:");
  sami?.guardianProfile?.childLinks.forEach((l) =>
    console.log(`  - ${l.student.firstName} ${l.student.lastName} (DOB ${l.student.dob?.toISOString().slice(0, 10)})`),
  );

  // Tenant isolation sanity check: cross-tenant query should return nothing.
  const otherTenants = await p.tenant.count({ where: { slug: "nonexistent" } });
  console.log(`\nCross-tenant probe (slug=nonexistent): ${otherTenants} (expect 0)`);
}

main().finally(() => p.$disconnect());
