import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarClock, Lock, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { loadEntityFieldsConfig } from "@/app/(app)/settings/_actions";
import { startRenewal } from "@/app/(app)/parent/applications/_actions";
import { ChildInfoView } from "./_info";

/** Fiche categories a parent may see (read-only). Admin-only categories
 *  (Finance, Justificatifs, …) stay hidden; `formHidden` fields too. */
const PARENT_VIEW_CATEGORIES = [
  "Info générale",
  "Scolarité",
  "Services",
  "Autorisations",
  "Info Arabe",
];

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

export default async function ParentChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withParentSession(async (user, childIds) => {
    if (!childIds.includes(id)) notFound();

    const tParent = await getTranslations("parent");
    const tBill = await getTranslations("billing");

    const now = new Date();
    const [child, invoices, studentConfig, openCycles] = await Promise.all([
      db.student.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          dob: true,
          customAnswers: true,
          // Pull both the active-year enrollment AND the upcoming one so a
          // newly-accepted student (enrolled in next year but no current year)
          // still shows their class on the dashboard.
          enrollments: {
            orderBy: { academicYear: { startDate: "desc" } },
            select: {
              class: { select: { name: true } },
              academicYear: {
                select: { label: true, isActive: true, startDate: true },
              },
            },
            take: 3,
          },
        },
      }),
      db.invoice.findMany({
        where: { studentId: id },
        orderBy: { issuedAt: "desc" },
        include: { payments: { select: { amountCents: true } } },
      }),
      loadEntityFieldsConfig("student"),
      db.admissionCycle.findMany({
        where: {
          isActive: true,
          openAt: { lte: now },
          OR: [{ closeAt: null }, { closeAt: { gte: now } }],
        },
        orderBy: { openAt: "desc" },
        select: { id: true, targetYearLabel: true },
      }),
    ]);

    if (!child) notFound();

    // Renewal dossiers of THIS child in the open campaigns.
    const renewals = openCycles.length
      ? await db.application.findMany({
          where: { existingStudentId: id, cycleId: { in: openCycles.map((c) => c.id) } },
          select: { id: true, cycleId: true, status: true },
        })
      : [];
    const renewalByCycle = new Map(renewals.map((r) => [r.cycleId, r]));

    // Read-only fiche: parent-visible categories, minus dossier-bound
    // structural fields (name/level pickers — identity is in the header).
    const viewCatIds = new Set(
      studentConfig.categories
        .filter((c) => PARENT_VIEW_CATEGORIES.includes(c.name))
        .map((c) => c.id),
    );
    const viewConfig = {
      categories: studentConfig.categories.filter((c) => viewCatIds.has(c.id)),
      fields: studentConfig.fields.filter(
        (f) => viewCatIds.has(f.categoryId) && !f.dossierBoundTo,
      ),
    };
    const rawAnswers =
      child.customAnswers && typeof child.customAnswers === "object"
        ? (child.customAnswers as Record<string, unknown>)
        : {};
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawAnswers)) {
      if (typeof v === "string") answers[k] = v;
    }
    if (child.dob) answers.date_naissance = child.dob.toISOString().slice(0, 10);

    // Prefer the active year, fall back to the most recent upcoming year.
    const activeEnrollment = child.enrollments.find(
      (e) => e.academicYear.isActive,
    );
    const upcomingEnrollment = child.enrollments.find(
      (e) => !e.academicYear.isActive && e.academicYear.startDate > new Date(),
    );
    const enrollment = activeEnrollment ?? upcomingEnrollment;
    const isUpcoming = !activeEnrollment && !!upcomingEnrollment;

    const description = enrollment
      ? `${enrollment.class.name} · ${enrollment.academicYear.label}`
      : "—";
    if (enrollment) answers.classe = enrollment.class.name;
    const tAdm = await getTranslations("admissions");

    return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${child.firstName} ${child.lastName}`}
            description={description}
            action={
              <Link
                href="/parent/dashboard"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {tParent("dashboardTitle")}
              </Link>
            }
          />

          {isUpcoming ? (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] px-4 py-3 text-sm text-[color:var(--color-brand-700)]">
              <CalendarClock
                className="mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <p>
                <span className="font-medium">
                  {child.firstName} {child.lastName}
                </span>{" "}
                est inscrit·e en{" "}
                <span className="font-semibold">
                  {enrollment!.class.name}
                </span>{" "}
                pour {enrollment!.academicYear.label} — les informations
                et factures apparaîtront ici dès la rentrée.
              </p>
            </div>
          ) : null}

          {/* Réinscription state: CTA per open campaign, or the read-only hint. */}
          {openCycles.length > 0 ? (
            <div className="space-y-2">
              {openCycles.map((cycle) => {
                const existing = renewalByCycle.get(cycle.id);
                return existing ? (
                  <Link
                    key={cycle.id}
                    href={`/parent/inscriptions/${existing.id}/edit`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-success)]/30 bg-[color:var(--color-success-soft)] px-4 py-3 text-sm text-[color:var(--color-success-soft-fg)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-success-soft)]/80"
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="size-4" aria-hidden />
                      <span className="font-medium">
                        {tAdm("renewalBadge")} {cycle.targetYearLabel}
                      </span>
                      <span className="opacity-80">— {tParent("renewContinue")}</span>
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wider">
                      {existing.status}
                    </span>
                  </Link>
                ) : (
                  <form
                    key={cycle.id}
                    action={startRenewal}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] px-4 py-3"
                  >
                    <input type="hidden" name="studentId" value={child.id} />
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <span className="text-sm text-[color:var(--color-brand-700)]">
                      {tAdm("renewCta", { year: cycle.targetYearLabel })}
                    </span>
                    <Button type="submit" size="sm" className="shrink-0 gap-1">
                      <Plus className="size-3.5" aria-hidden />
                      {tAdm("renewalBadge")}
                    </Button>
                  </form>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{tParent("renewClosedHint")}</p>
            </div>
          )}

          {/* Read-only fiche (greyed) — editing happens in the réinscription
              dossier while a campaign is open. */}
          <Card>
            <CardHeader
              title={tParent("childInfoTitle")}
              description={tParent("childInfoHint")}
            />
            <CardBody>
              <ChildInfoView config={viewConfig} answers={answers} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={tParent("tabInvoices")} />
            <Table>
              <THead>
                <tr>
                  <TH>{tBill("colNumber")}</TH>
                  <TH>{tBill("colIssued")}</TH>
                  <TH className="text-end">{tBill("colTotal")}</TH>
                  <TH className="text-end">{tBill("colBalance")}</TH>
                  <TH>{tBill("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {invoices.length === 0 ? (
                  <EmptyRow colSpan={5}>{tBill("empty")}</EmptyRow>
                ) : (
                  invoices.map((inv) => {
                    const paid = inv.payments.reduce(
                      (a, p) => a + Number(p.amountCents),
                      0,
                    );
                    const balance = Number(inv.totalCents) - paid;
                    return (
                      <TR key={inv.id}>
                        <TD className="font-mono text-xs text-[color:var(--color-foreground)]">
                          {inv.number}
                        </TD>
                        <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                          {inv.issuedAt.toISOString().slice(0, 10)}
                        </TD>
                        <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                          {formatMoney(inv.totalCents, inv.currency)}
                        </TD>
                        <TD className="text-end tabular-nums">
                          {balance > 0 ? (
                            <span className="font-medium text-[color:var(--color-foreground)]">
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
                  })
                )}
              </tbody>
            </Table>
          </Card>
        </main>
    );
  });
}
