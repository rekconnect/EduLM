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
  const rania = await u.user.findFirst({
    where: { email: "rania.nasr@example.com" },
    select: { id: true },
  });
  if (!admin || !sami || !rania) throw new Error("admins/parents not seeded");

  // 1. Admin posts an announcement to all parents.
  const ann = await u.announcement.create({
    data: {
      tenantId: tenant.id,
      title: "Vacances de la Toussaint",
      body: "Les vacances commencent le 18 octobre.\n\nBonne pause à toutes et tous.",
      audience: "ALL_PARENTS",
      publishedByUserId: admin.id,
    },
  });
  console.log(`✓ Admin posted announcement: "${ann.title}"`);

  // 2. Sami marks it as read.
  await u.announcementRead.create({
    data: { announcementId: ann.id, userId: sami.id },
  });
  console.log(`✓ Sami marked it read`);

  // 3. Verify read counts: 1 read, Rania still unread.
  const reads = await u.announcementRead.count({ where: { announcementId: ann.id } });
  const ranAck = await u.announcementRead.findUnique({
    where: { announcementId_userId: { announcementId: ann.id, userId: rania.id } },
  });
  console.log(`✓ Reads count: ${reads} (Rania read: ${ranAck ? "YES" : "NO"})`);

  // 4. Sami sends a contact message.
  const msg = await u.contactMessage.create({
    data: {
      tenantId: tenant.id,
      fromUserId: sami.id,
      subject: "Question facture INV-2526-0001",
      body: "Bonjour, est-il possible d'échelonner le paiement ?",
      status: "NEW",
    },
  });
  console.log(`✓ Sami sent message: "${msg.subject}" status=${msg.status}`);

  // 5. Admin marks it read.
  await u.contactMessage.update({
    where: { id: msg.id },
    data: { status: "READ", readAt: new Date(), readByUserId: admin.id },
  });
  console.log(`✓ Admin marked it read`);

  // 6. Admin closes it.
  await u.contactMessage.update({
    where: { id: msg.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  const closed = await u.contactMessage.findUnique({
    where: { id: msg.id },
    select: { status: true, closedAt: true },
  });
  console.log(`✓ Closed: status=${closed?.status} closedAt=${closed?.closedAt?.toISOString().slice(0, 10)}`);

  // Cleanup.
  await u.contactMessage.delete({ where: { id: msg.id } });
  await u.announcementRead.deleteMany({ where: { announcementId: ann.id } });
  await u.announcement.delete({ where: { id: ann.id } });
  await u.$disconnect();
  console.log("\n✓ cleanup done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
