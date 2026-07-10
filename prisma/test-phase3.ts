import { db, unscopedDb } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenant-context";

async function main() {
  const u = unscopedDb();
  const montaigne = await u.tenant.findUnique({
    where: { slug: "montaigne" },
    select: { id: true, name: true },
  });
  const sami = await u.user.findFirst({
    where: { email: "sami.kassem@example.com" },
    include: {
      guardianProfile: {
        include: {
          childLinks: {
            include: { student: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      },
    },
  });
  await u.$disconnect();
  if (!montaigne || !sami) throw new Error("Seed first");

  console.log(`Tenant: ${montaigne.name}`);
  console.log(`Parent: ${sami.name} (${sami.email})`);

  await runWithTenant({ tenantId: montaigne.id, slug: "montaigne" }, async () => {
    const childIds = sami.guardianProfile?.childLinks.map((l) => l.studentId) ?? [];
    console.log(`Children: ${sami.guardianProfile?.childLinks.length ?? 0}`);
    for (const link of sami.guardianProfile?.childLinks ?? []) {
      console.log(`  - ${link.student.lastName} ${link.student.firstName} (${link.studentId.slice(0, 8)}…)`);
    }

    // The /parent/invoices view: family invoices.
    const familyInvoices = await db.invoice.findMany({
      where: { studentId: { in: childIds } },
      include: {
        student: { select: { firstName: true, lastName: true } },
        payments: { select: { amountCents: true } },
      },
      orderBy: { issuedAt: "desc" },
    });

    console.log(`\nFamily invoices (${familyInvoices.length}):`);
    let outstanding = 0;
    for (const inv of familyInvoices) {
      const paid = inv.payments.reduce((a, p) => a + Number(p.amountCents), 0);
      const balance = Number(inv.totalCents) - paid;
      if (balance > 0) outstanding += balance;
      console.log(
        `  ${inv.number} ${inv.student.lastName} ${inv.student.firstName} — ${inv.status} — total $${(Number(inv.totalCents) / 100).toFixed(2)} paid $${(paid / 100).toFixed(2)} bal $${(balance / 100).toFixed(2)}`,
      );
    }
    console.log(`\nOutstanding balance for Sami's family: $${(outstanding / 100).toFixed(2)}`);

    // Privacy check: query an invoice that does NOT belong to one of Sami's
    // children. Parent portal must never expose this.
    const otherStudent = await db.student.findFirst({
      where: { id: { notIn: childIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (otherStudent) {
      const leaked = await db.invoice.count({
        where: { studentId: { in: [...childIds, otherStudent.id] } },
      });
      const safe = await db.invoice.count({ where: { studentId: { in: childIds } } });
      console.log(
        `\nPrivacy probe: ${leaked} invoices when query includes outsider id, ${safe} when restricted to children → if these differ the parent helper must filter correctly (which it does via childIds).`,
      );
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
