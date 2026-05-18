import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { startRenewal } from "../applications/_actions";

export default async function ParentDashboardPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("parent");
    const tAtt = await getTranslations("attendance");
    const tAdm = await getTranslations("admissions");

    if (childIds.length === 0) {
      // New parents (signed up for admissions but no accepted application yet)
      // see a friendly welcome with their applications + a CTA to start one.
      const apps = await db.application.findMany({
        where: { submittedByUserId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { cycle: { select: { label: true } } },
      });

      return (
        <div className="min-h-screen">
          <AppHeader role={user.role} userLabel={user.name ?? user.email} />
          <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
            <PageHeader
              title={t("dashboardTitle")}
              description={t("welcome", { name: user.name ?? user.email })}
            />
            <Card>
              <CardBody>
                {apps.length === 0 ? (
                  <>
                    <p className="text-sm text-[color:var(--muted-fg)]">{t("noChildren")}</p>
                    <div className="mt-4">
                      <Link
                        href="/parent/applications/new"
                        className="inline-flex items-center rounded-md bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] transition hover:opacity-90"
                      >
                        + Nouvelle inscription
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-base font-semibold">Mes dossiers</h2>
                    <ul className="mt-3 space-y-2 text-sm">
                      {apps.map((a) => (
                        <li key={a.id}>
                          <Link
                            href={
                              a.status === "DRAFT"
                                ? `/parent/applications/${a.id}/edit`
                                : `/parent/applications/${a.id}`
                            }
                            className="flex items-center justify-between rounded-md border border-[color:var(--border)] px-3 py-2 transition hover:bg-[color:var(--muted)]"
                          >
                            <span>
                              <span className="font-medium">
                                {a.childFirstName || "—"} {a.childLastName || ""}
                              </span>
                              <span className="ms-2 text-xs text-[color:var(--muted-fg)]">
                                {a.cycle.label}
                              </span>
                            </span>
                            <span className="text-xs text-[color:var(--muted-fg)]">
                              {a.status}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      <Link
                        href="/parent/applications"
                        className="text-sm text-[color:var(--primary)] hover:underline"
                      >
                        Voir tous mes dossiers →
                      </Link>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          </main>
        </div>
      );
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);
    const now = new Date();

    const [children, openCycles, existingRenewals] = await Promise.all([
      db.student.findMany({
        where: { id: { in: childIds } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { academicYear: { isActive: true } },
            select: { class: { select: { name: true } } },
            take: 1,
          },
          attendance: {
            where: { date: { gte: since } },
            select: { status: true },
          },
          invoices: {
            select: { totalCents: true, currency: true, payments: { select: { amountCents: true } } },
          },
        },
      }),
      db.admissionCycle.findMany({
        where: {
          isActive: true,
          openAt: { lte: now },
          OR: [{ closeAt: null }, { closeAt: { gte: now } }],
        },
        orderBy: { openAt: "desc" },
        select: { id: true, label: true, targetYearLabel: true },
      }),
      db.application.findMany({
        where: {
          existingStudentId: { in: childIds },
          status: { not: "WITHDRAWN" },
        },
        select: { existingStudentId: true, cycleId: true, id: true, status: true },
      }),
    ]);

    const renewalMap = new Map<string, { id: string; status: string }>();
    for (const r of existingRenewals) {
      if (r.existingStudentId) {
        renewalMap.set(`${r.existingStudentId}::${r.cycleId}`, { id: r.id, status: r.status });
      }
    }

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("dashboardTitle")}
            description={t("welcome", { name: user.name ?? user.email })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {children.map((c) => {
              const counts: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
              for (const r of c.attendance) {
                counts[r.status] = (counts[r.status] ?? 0) + 1;
              }
              const klass = c.enrollments[0]?.class.name ?? "—";
              const balanceByCurrency = new Map<string, number>();
              for (const inv of c.invoices) {
                const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
                const bal = inv.totalCents - paid;
                if (bal > 0) {
                  balanceByCurrency.set(
                    inv.currency,
                    (balanceByCurrency.get(inv.currency) ?? 0) + bal,
                  );
                }
              }

              return (
                <Card key={c.id}>
                  <CardHeader
                    title={`${c.firstName} ${c.lastName}`}
                    description={`${t("currentClass")}: ${klass}`}
                  />
                  <CardBody className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border border-[color:var(--border)] py-3">
                        <p className="text-2xl font-semibold tabular-nums">
                          {counts.PRESENT}
                        </p>
                        <p className="text-xs text-[color:var(--muted-fg)]">
                          {tAtt("presentCount")}
                        </p>
                      </div>
                      <div className="rounded-md border border-[color:var(--border)] py-3">
                        <p className="text-2xl font-semibold tabular-nums text-red-600">
                          {counts.ABSENT}
                        </p>
                        <p className="text-xs text-[color:var(--muted-fg)]">
                          {tAtt("absentCount")}
                        </p>
                      </div>
                      <div className="rounded-md border border-[color:var(--border)] py-3">
                        <p className="text-2xl font-semibold tabular-nums text-amber-600">
                          {counts.LATE}
                        </p>
                        <p className="text-xs text-[color:var(--muted-fg)]">
                          {tAtt("lateCount")}
                        </p>
                      </div>
                    </div>

                    {balanceByCurrency.size > 0 ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                        <span className="font-medium">{t("outstanding")}: </span>
                        {Array.from(balanceByCurrency.entries()).map(([cur, bal]) => (
                          <span key={cur} className="me-2 tabular-nums">
                            {formatMoney(bal, cur)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {openCycles.length > 0 ? (
                      <div className="space-y-1 border-t border-[color:var(--border)] pt-3">
                        {openCycles.map((cycle) => {
                          const existing = renewalMap.get(`${c.id}::${cycle.id}`);
                          if (existing) {
                            return (
                              <Link
                                key={cycle.id}
                                href={
                                  existing.status === "DRAFT"
                                    ? `/parent/applications/${existing.id}/edit`
                                    : `/parent/applications/${existing.id}`
                                }
                                className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40"
                              >
                                <span>
                                  <span className="font-medium">
                                    {tAdm("renewalBadge")}
                                  </span>{" "}
                                  <span className="text-[color:var(--muted-fg)]">
                                    {cycle.targetYearLabel}
                                  </span>
                                </span>
                                <span className="text-xs uppercase">{existing.status}</span>
                              </Link>
                            );
                          }
                          return (
                            <form
                              key={cycle.id}
                              action={startRenewal}
                              className="flex items-center justify-between gap-2"
                            >
                              <input type="hidden" name="studentId" value={c.id} />
                              <input type="hidden" name="cycleId" value={cycle.id} />
                              <span className="text-sm text-[color:var(--muted-fg)]">
                                {tAdm("renewCta", { year: cycle.targetYearLabel })}
                              </span>
                              <Button type="submit" size="sm">
                                + {tAdm("renewalBadge")}
                              </Button>
                            </form>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="flex justify-end">
                      <LinkButton href={`/parent/children/${c.id}`} size="sm" variant="secondary">
                        {t("viewChild")}
                      </LinkButton>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    );
  });
}
