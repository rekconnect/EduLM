import { db, unscopedDb } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenant-context";

async function main() {
  const u = unscopedDb();
  const montaigne = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true, name: true },
  });
  await u.$disconnect();
  if (!montaigne) throw new Error("Seed first — montaigne tenant not found");

  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    const stats = {
      students: await db.student.count(),
      classes: await db.class.count(),
      enrollments: await db.enrollment.count(),
      teachers: await db.user.count({ where: { role: "TEACHER" } }),
      parents: await db.user.count({ where: { role: "PARENT" } }),
    };
    console.log(`Scoped to ${montaigne.name}:`);
    console.log(JSON.stringify(stats, null, 2));

    const sample = await db.student.findMany({
      take: 3,
      orderBy: { lastName: "asc" },
      include: {
        enrollments: { include: { class: { select: { name: true } } } },
      },
    });
    console.log("\nFirst 3 students (auto-scoped):");
    sample.forEach((s) => {
      const klass = s.enrollments[0]?.class.name ?? "—";
      console.log(`  - ${s.lastName} ${s.firstName} → ${klass}`);
    });
  });

  // Confirm scoping refuses unscoped reads.
  let unscopedBlocked = false;
  try {
    await db.student.count();
  } catch (e) {
    unscopedBlocked = (e as Error).message.includes("Refusing to run unscoped");
  }
  console.log(`\nUnscoped read blocked: ${unscopedBlocked ? "YES ✓" : "NO ✗"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
