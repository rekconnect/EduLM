import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";

type InvoiceRow = Prisma.InvoiceGetPayload<{
  include: {
    student: { select: { id: true; firstName: true; lastName: true } };
    payments: { select: { amountCents: true } };
  };
}>;

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  ISSUED: "statusIssued",
  PARTIALLY_PAID: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  OVERDUE: "statusOverdue",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-200 text-zinc-700",
  OVERDUE: "bg-red-100 text-red-800",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("billing");

    const allowedStatuses: InvoiceStatus[] = [
      "DRAFT",
      "ISSUED",
      "PARTIALLY_PAID",
      "PAID",
      "CANCELLED",
      "OVERDUE",
    ];
    const filter =
      status && (allowedStatuses as string[]).includes(status)
        ? { status: status as InvoiceStatus }
        : undefined;

    const invoices = (await db.invoice.findMany({
      where: filter,
      orderBy: { issuedAt: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { amountCents: true } },
      },
    })) as InvoiceRow[];

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("subtitle")}
            action={
              user.role === "SCHOOL_ADMIN" ? (
                <LinkButton href="/billing/new" size="sm">
                  {t("createCta")}
                </LinkButton>
              ) : undefined
            }
          />

          <Card>
            <CardBody>
              <form method="get" className="max-w-xs">
                <Field label={t("colStatus")} htmlFor="status">
                  <Select id="status" name="status" defaultValue={status ?? ""}>
                    <option value="">{t("filterAll")}</option>
                    {allowedStatuses.map((s) => (
                      <option key={s} value={s}>
                        {t(STATUS_KEY[s] ?? "statusDraft")}
                      </option>
                    ))}
                  </Select>
                </Field>
              </form>
            </CardBody>
          </Card>

          <Table>
            <THead>
              <tr>
                <TH>{t("colNumber")}</TH>
                <TH>{t("colStudent")}</TH>
                <TH>{t("colIssued")}</TH>
                <TH>{t("colDue")}</TH>
                <TH className="text-right">{t("colTotal")}</TH>
                <TH className="text-right">{t("colBalance")}</TH>
                <TH>{t("colStatus")}</TH>
              </tr>
            </THead>
            <tbody>
              {invoices.length === 0 ? (
                <EmptyRow colSpan={7}>{t("empty")}</EmptyRow>
              ) : (
                invoices.map((inv) => {
                  const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
                  const balance = inv.totalCents - paid;
                  return (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs">
                        <Link href={`/billing/${inv.id}`} className="hover:underline">
                          {inv.number}
                        </Link>
                      </TD>
                      <TD>
                        <Link
                          href={`/students/${inv.student.id}`}
                          className="hover:underline"
                        >
                          {inv.student.lastName} {inv.student.firstName}
                        </Link>
                      </TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {inv.issuedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {inv.dueAt ? inv.dueAt.toISOString().slice(0, 10) : "—"}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {formatMoney(inv.totalCents, inv.currency)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {balance > 0 ? (
                          <span className="font-medium">
                            {formatMoney(balance, inv.currency)}
                          </span>
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
                          {t(STATUS_KEY[inv.status] ?? "statusDraft")}
                        </span>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </div>
    );
  });
}
