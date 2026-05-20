import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarClock, Coins, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StaggerGrid } from "@/components/ui/stagger-grid";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { startApplication } from "../_actions";
import { formatMoney } from "@/lib/money";

export default async function NewApplicationPage() {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");
    const now = new Date();

    const cycles = await db.admissionCycle.findMany({
      where: {
        isActive: true,
        openAt: { lte: now },
        OR: [{ closeAt: null }, { closeAt: { gte: now } }],
      },
      orderBy: { openAt: "desc" },
    });

    return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader title={t("pickCycleTitle")} description={t("pickCycleLead")} />

          {cycles.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]">
                <CalendarClock className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("noOpenCycle")}
              </p>
            </div>
          ) : (
            <StaggerGrid className="space-y-3">
              {cycles.map((c) => (
                <Card
                  key={c.id}
                  className="transition-shadow duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]"
                >
                  <CardBody>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                          <GraduationCap className="size-5" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold text-[color:var(--color-foreground)]">
                            {c.label}
                          </h2>
                          {c.description ? (
                            <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
                              {c.description}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-foreground-muted)]">
                            <span className="font-medium text-[color:var(--color-foreground)]">
                              {c.targetYearLabel}
                            </span>
                            {c.closeAt ? (
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock className="size-3" aria-hidden />
                                {t("deadlineLabel")}:{" "}
                                <span className="tabular-nums">
                                  {c.closeAt.toISOString().slice(0, 10)}
                                </span>
                              </span>
                            ) : null}
                            {c.inscriptionFeeCents && c.inscriptionFeeCents > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <Coins className="size-3" aria-hidden />
                                {t("feeLabel")}:{" "}
                                <span className="tabular-nums">
                                  {formatMoney(c.inscriptionFeeCents, c.currency)}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <form action={startApplication} className="shrink-0">
                        <input type="hidden" name="cycleId" value={c.id} />
                        <Button type="submit" className="gap-1.5">
                          {t("ctaStart")}
                          <ArrowRight className="size-4" aria-hidden />
                        </Button>
                      </form>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </StaggerGrid>
          )}
        </main>
    );
  });
}
