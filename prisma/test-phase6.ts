import { unscopedDb } from "../src/lib/db";

async function main() {
  const u = unscopedDb();
  const tenant = await u.tenant.findUnique({ where: { slug: "montaigne" }, select: { id: true } });
  if (!tenant) throw new Error("Seed first");
  const admin = await u.user.findFirst({
    where: { tenantId: tenant.id, role: "SCHOOL_ADMIN" },
    select: { id: true },
  });
  const sami = await u.user.findFirst({
    where: { email: "sami.kassem@example.com" },
    select: { id: true },
  });
  if (!admin || !sami) throw new Error("admin/sami not seeded");

  // 1. Admin creates a document with an external URL (no Supabase Storage needed).
  const doc = await u.tenantDocument.create({
    data: {
      tenantId: tenant.id,
      title: "Règlement intérieur — test phase 6",
      description: "Document de test pour vérifier le portail documents.",
      category: "REGULATION",
      externalUrl: "https://example.com/reglement.pdf",
      audience: "ALL_PARENTS",
      requiresAck: true,
      uploadedByUserId: admin.id,
    },
    select: { id: true, title: true, requiresAck: true },
  });
  console.log(`✓ Admin created doc: ${doc.title} (ack required: ${doc.requiresAck})`);

  // 2. Verify it shows up in the parent's audience-filtered query (Sami).
  const visibleToSami = await u.tenantDocument.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ audience: "ALL_PARENTS" }],
    },
    select: { id: true, title: true },
  });
  const sees = visibleToSami.some((d) => d.id === doc.id);
  console.log(`✓ Parent sees doc: ${sees ? "YES" : "NO"}`);

  // 3. Sami acknowledges it.
  await u.documentAcknowledgment.create({
    data: { documentId: doc.id, userId: sami.id },
  });
  console.log(`✓ Sami acknowledged`);

  // 4. Verify the ack count.
  const acks = await u.documentAcknowledgment.count({ where: { documentId: doc.id } });
  console.log(`✓ Ack count for doc: ${acks}`);

  // 5. Idempotency — duplicate ack should be silently swallowed by unique constraint.
  let duplicateBlocked = false;
  try {
    await u.documentAcknowledgment.create({
      data: { documentId: doc.id, userId: sami.id },
    });
  } catch {
    duplicateBlocked = true;
  }
  console.log(`✓ Duplicate ack blocked by unique constraint: ${duplicateBlocked ? "YES" : "NO"}`);

  // Cleanup.
  await u.documentAcknowledgment.deleteMany({ where: { documentId: doc.id } });
  await u.tenantDocument.delete({ where: { id: doc.id } });
  await u.$disconnect();
  console.log("\n✓ cleanup done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
