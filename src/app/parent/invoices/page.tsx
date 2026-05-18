import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-200 text-zinc-700",
  OVERDUE: "bg-red-100 text-red-800",
};

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  ISSUED: "statusIssued",
  PARTIALLY_PAID: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  OVERDUE: "statusOverdue",
};

export default async function ParentInvoicesPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("parent");
    const tBill = await getTranslations("billing");

    if (childIds.length === 0) {
      return (
        <AppShell role={user.role} userLabel={user.name ?? user.email} >
          <main className="mx-auto max-w-3xl px-6 py-10">
            <PageHeader title={t("invoicesTitle")} />
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noChildren")}</p>
              </CardBody>
            </Card>
          </main>
        </AppShell>
      );
    }

    const invoices = await db.invoice.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { issuedAt: "desc" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { amountCents: true } },
      },
    });

    // Per-currency outstanding total
    const outstanding = new Map<string, number>();
    for (const inv of invoices) {
      const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
      const bal = inv.totalCents - paid;
      if (bal > 0) {
        outstanding.set(inv.currency, (outstanding.get(inv.currency) ?? 0) + bal);
      }
    }

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
          <PageHeader title={t("invoicesTitle")} />

          {outstanding.size > 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm font-medium">{t("outstanding")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">
                  {Array.from(outstanding.entries())
                    .map(([cur, bal]) => formatMoney(bal, cur))
                    .join(" · ")}
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Table>
            <THead>
              <tr>
                <TH>{tBill("colNumber")}</TH>
                <TH>{tBill("colStudent")}</TH>
                <TH>{tBill("colIssued")}</TH>
                <TH className="text-right">{tBill("colTotal")}</TH>
                <TH className="text-right">{tBill("colBalance")}</TH>
                <TH>{tBill("colStatus")}</TH>
              </tr>
            </THead>
            <tbody>
              {invoices.length === 0 ? (
                <EmptyRow colSpan={6}>{tBill("empty")}</EmptyRow>
              ) : (
                invoices.map((inv) => {
                  const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
                  const balance = inv.totalCents - paid;
                  return (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs">{inv.number}</TD>
                      <TD>
                        <Link
                          href={`/parent/children/${inv.student.id}`}
                          className="hover:underline"
                        >
                          {inv.student.lastName} {inv.student.firstName}
                        </Link>
                      </TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {inv.issuedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatMoney(inv.totalCents, inv.currency)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {balance > 0 ? (
                          <span className="font-medium">{formatMoney(balance, inv.currency)}</span>
                        ) : (
                          <span className="text-emerald-600">—</span>
                        )}
                      </TD>
                      <TD>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_TONE[inv.status]
                          }`}
                        >
                          {tBill(STATUS_KEY[inv.status] ?? "statusDraft")}
                        </span>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}
