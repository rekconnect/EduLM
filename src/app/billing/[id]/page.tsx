import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney, centsToDecimalString } from "@/lib/money";
import { deleteInvoice, issueInvoice } from "../_actions";
import { RecordPaymentForm } from "./_record-payment";

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  ISSUED: "statusIssued",
  PARTIALLY_PAID: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  OVERDUE: "statusOverdue",
};

const METHOD_KEY: Record<string, string> = {
  CASH: "methodCash",
  BANK_TRANSFER: "methodBankTransfer",
  CHEQUE: "methodCheque",
  CARD: "methodCard",
  OTHER: "methodOther",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("billing");
    const tCommon = await getTranslations("common");

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        lines: true,
        payments: {
          orderBy: { paidAt: "desc" },
          include: { recordedBy: { select: { name: true, email: true } } },
        },
        academicYear: { select: { label: true } },
      },
    });
    if (!invoice) notFound();

    const paid = invoice.payments.reduce((a, p) => a + p.amountCents, 0);
    const balance = invoice.totalCents - paid;
    const isAdmin = user.role === "SCHOOL_ADMIN";
    const boundDelete = deleteInvoice.bind(null, id);
    const boundIssue = issueInvoice.bind(null, id);

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${t("editTitle")} ${invoice.number}`}
            description={`${invoice.student.lastName} ${invoice.student.firstName} · ${invoice.academicYear.label}`}
            action={
              <Link
                href="/billing"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {tCommon("back")}
              </Link>
            }
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[color:var(--border)] p-4">
              <p className="text-xs uppercase tracking-wide text-[color:var(--muted-fg)]">
                {t("total")}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {formatMoney(invoice.totalCents, invoice.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--border)] p-4">
              <p className="text-xs uppercase tracking-wide text-[color:var(--muted-fg)]">
                {t("paid")}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600">
                {formatMoney(paid, invoice.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--border)] p-4">
              <p className="text-xs uppercase tracking-wide text-[color:var(--muted-fg)]">
                {t("balance")}
              </p>
              <p
                className={`mt-2 text-2xl font-semibold tabular-nums ${
                  balance > 0 ? "" : "text-emerald-600"
                }`}
              >
                {formatMoney(balance, invoice.currency)}
              </p>
            </div>
          </div>

          <Card>
            <CardHeader
              title={t("fieldLines")}
              action={
                <span className="text-sm">
                  <span className="me-2 text-[color:var(--muted-fg)]">
                    {t("colStatus")}:
                  </span>
                  <span className="rounded-full bg-[color:var(--muted)] px-2 py-0.5 text-xs font-medium">
                    {t(STATUS_KEY[invoice.status] ?? "statusDraft")}
                  </span>
                </span>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>{t("lineDescription")}</TH>
                  <TH className="text-right">{t("lineQuantity")}</TH>
                  <TH className="text-right">{t("lineAmount")}</TH>
                  <TH className="text-right">{t("total")}</TH>
                </tr>
              </THead>
              <tbody>
                {invoice.lines.map((l) => (
                  <TR key={l.id}>
                    <TD>{l.description}</TD>
                    <TD className="text-right tabular-nums">{l.quantity}</TD>
                    <TD className="text-right tabular-nums">
                      {formatMoney(l.amountCents, invoice.currency)}
                    </TD>
                    <TD className="text-right font-medium tabular-nums">
                      {formatMoney(l.amountCents * l.quantity, invoice.currency)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {invoice.notes ? (
              <CardBody>
                <p className="whitespace-pre-line text-sm text-[color:var(--muted-fg)]">
                  {invoice.notes}
                </p>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t("paymentsTitle")} />
            <CardBody className="space-y-4">
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noPayments")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {invoice.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between border-b border-[color:var(--border)] py-2 last:border-0"
                    >
                      <span>
                        <span className="font-medium tabular-nums">
                          {formatMoney(p.amountCents, invoice.currency)}
                        </span>{" "}
                        <span className="text-[color:var(--muted-fg)]">
                          · {t(METHOD_KEY[p.method] ?? "methodOther")} ·{" "}
                          {p.paidAt.toISOString().slice(0, 10)}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-[color:var(--muted-fg)]">
                        — {p.recordedBy.name ?? p.recordedBy.email}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {isAdmin && balance > 0 && invoice.status !== "CANCELLED" ? (
                <RecordPaymentForm
                  invoiceId={invoice.id}
                  defaultAmount={centsToDecimalString(balance)}
                  currency={invoice.currency}
                />
              ) : null}
            </CardBody>
          </Card>

          {isAdmin ? (
            <div className="flex items-center justify-end gap-2">
              {invoice.status === "DRAFT" ? (
                <form action={boundIssue}>
                  <Button variant="secondary" size="sm" type="submit">
                    {t("issue")}
                  </Button>
                </form>
              ) : null}
              <form action={boundDelete}>
                <Button variant="danger" size="sm" type="submit">
                  {tCommon("delete")}
                </Button>
              </form>
            </div>
          ) : null}
        </main>
      </AppShell>
    );
  });
}
