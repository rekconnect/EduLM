import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";

export default async function ParentDashboardPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("parent");
    const tAtt = await getTranslations("attendance");

    if (childIds.length === 0) {
      return (
        <div className="min-h-screen">
          <AppHeader role={user.role} userLabel={user.name ?? user.email} />
          <main className="mx-auto max-w-3xl px-6 py-10">
            <PageHeader title={t("dashboardTitle")} />
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noChildren")}</p>
              </CardBody>
            </Card>
          </main>
        </div>
      );
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);

    const children = await db.student.findMany({
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
    });

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
