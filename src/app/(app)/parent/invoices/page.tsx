import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertCircle, Receipt } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  DRAFT:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  ISSUED:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  PARTIALLY_PAID:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  PAID:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  CANCELLED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
  OVERDUE:
    "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
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
          <main className="mx-auto max-w-3xl px-6 py-10">
            <PageHeader title={t("invoicesTitle")} />
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Receipt className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("noChildren")}
              </p>
            </div>
          </main>
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

    const outstanding = new Map<string, number>();
    for (const inv of invoices) {
      const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
      const bal = inv.totalCents - paid;
      if (bal > 0) {
        outstanding.set(inv.currency, (outstanding.get(inv.currency) ?? 0) + bal);
      }
    }

    return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader title={t("invoicesTitle")} />

          {outstanding.size > 0 ? (
            <Card className="border-[color:var(--color-warning)]/30">
              <CardBody>
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]">
                    <AlertCircle className="size-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[color:var(--color-foreground)]">
                      {t("outstanding")}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--color-warning-soft-fg)]">
                      {Array.from(outstanding.entries())
                        .map(([cur, bal]) => formatMoney(bal, cur))
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {invoices.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Receipt className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {tBill("empty")}
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{tBill("colNumber")}</TH>
                  <TH>{tBill("colStudent")}</TH>
                  <TH>{tBill("colIssued")}</TH>
                  <TH className="text-end">{tBill("colTotal")}</TH>
                  <TH className="text-end">{tBill("colBalance")}</TH>
                  <TH>{tBill("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {invoices.map((inv) => {
                  const paid = inv.payments.reduce(
                    (a, p) => a + p.amountCents,
                    0,
                  );
                  const balance = inv.totalCents - paid;
                  const isOverdue = inv.status === "OVERDUE";
                  return (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs text-[color:var(--color-foreground)]">
                        {inv.number}
                      </TD>
                      <TD>
                        <Link
                          href={`/parent/children/${inv.student.id}`}
                          className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                        >
                          {inv.student.lastName} {inv.student.firstName}
                        </Link>
                      </TD>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {inv.issuedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                        {formatMoney(inv.totalCents, inv.currency)}
                      </TD>
                      <TD className="text-end tabular-nums">
                        {balance > 0 ? (
                          <span
                            className={cn(
                              "font-semibold",
                              isOverdue
                                ? "text-[color:var(--color-danger)]"
                                : "text-[color:var(--color-foreground)]",
                            )}
                          >
                            {formatMoney(balance, inv.currency)}
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-success)]">
                            ✓
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_TONE[inv.status],
                          )}
                        >
                          {tBill(STATUS_KEY[inv.status] ?? "statusDraft")}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </main>
    );
  });
}
