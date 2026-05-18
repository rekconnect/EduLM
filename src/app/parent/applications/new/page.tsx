import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <PageHeader title={t("pickCycleTitle")} description={t("pickCycleLead")} />

          {cycles.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noOpenCycle")}</p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-3">
              {cycles.map((c) => (
                <Card key={c.id}>
                  <CardBody>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">{c.label}</h2>
                        {c.description ? (
                          <p className="mt-1 text-sm text-[color:var(--muted-fg)]">
                            {c.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--muted-fg)]">
                          <span>{c.targetYearLabel}</span>
                          {c.closeAt ? (
                            <span>· {t("deadlineLabel")}: {c.closeAt.toISOString().slice(0, 10)}</span>
                          ) : null}
                          {c.inscriptionFeeCents && c.inscriptionFeeCents > 0 ? (
                            <span>· {t("feeLabel")}: {formatMoney(c.inscriptionFeeCents, c.currency)}</span>
                          ) : null}
                        </div>
                      </div>
                      <form action={startApplication}>
                        <input type="hidden" name="cycleId" value={c.id} />
                        <Button type="submit">{t("ctaStart")}</Button>
                      </form>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  });
}
