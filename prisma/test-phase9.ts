import { unscopedDb } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  const u = unscopedDb();
  const tenant = await u.tenant.findUnique({ where: { slug: "montaigne" }, select: { id: true } });
  if (!tenant) throw new Error("Seed first");

  // 1. Admin creates a new parent.
  const testEmail = `phase9-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash("temppw123", 10);
  const created = await u.user.create({
    data: {
      tenantId: tenant.id,
      email: testEmail,
      name: "Test Phase9",
      passwordHash,
      role: "PARENT",
      status: "ACTIVE",
      locale: "fr",
      emailVerified: new Date(),
    },
  });
  const guardian = await u.guardian.create({
    data: { tenantId: tenant.id, userId: created.id, relation: "père" },
  });
  console.log(`✓ Created parent: ${created.email} (guardian id=${guardian.id.slice(0, 8)}…)`);

  // 2. Update parent email.
  const updated = await u.user.update({
    where: { id: created.id },
    data: { email: `phase9-renamed-${Date.now()}@example.com` },
    select: { email: true },
  });
  console.log(`✓ Email updated to: ${updated.email}`);

  // 3. Link to a student (use Layla).
  const layla = await u.student.findFirst({
    where: { tenantId: tenant.id, firstName: "Layla" },
    select: { id: true },
  });
  if (!layla) throw new Error("Layla not seeded");
  await u.studentGuardian.create({
    data: { studentId: layla.id, guardianId: guardian.id, isPrimary: false },
  });
  const layla2 = await u.student.findUnique({
    where: { id: layla.id },
    include: { guardianLinks: { include: { guardian: { include: { user: { select: { email: true } } } } } } },
  });
  console.log(`✓ Layla now has ${layla2?.guardianLinks.length} linked guardian(s):`);
  layla2?.guardianLinks.forEach((l) =>
    console.log(`    - ${l.guardian.user.email} (primary=${l.isPrimary})`),
  );

  // 4. Unlink.
  await u.studentGuardian.delete({
    where: { studentId_guardianId: { studentId: layla.id, guardianId: guardian.id } },
  });
  const after = await u.studentGuardian.count({ where: { studentId: layla.id } });
  console.log(`✓ After unlink: Layla has ${after} guardian(s) (should be 1 — original Sami)`);

  // 5. Disable + re-enable.
  await u.user.update({ where: { id: created.id }, data: { status: "DISABLED" } });
  const disabled = await u.user.findUnique({ where: { id: created.id }, select: { status: true } });
  console.log(`✓ Disabled: status=${disabled?.status}`);
  await u.user.update({ where: { id: created.id }, data: { status: "ACTIVE" } });

  // 6. Reset password (simulate: new bcrypt hash).
  const newPw = "regenerated123";
  await u.user.update({
    where: { id: created.id },
    data: { passwordHash: await bcrypt.hash(newPw, 10) },
  });
  const ok = await bcrypt.compare(
    newPw,
    (await u.user.findUnique({ where: { id: created.id }, select: { passwordHash: true } }))!
      .passwordHash!,
  );
  console.log(`✓ Password reset verifies: ${ok ? "YES" : "NO"}`);

  // Cleanup.
  await u.guardian.delete({ where: { id: guardian.id } });
  await u.user.delete({ where: { id: created.id } });
  await u.$disconnect();
  console.log("\n✓ cleanup done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
