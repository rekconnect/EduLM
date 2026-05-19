import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus, Sliders } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";

export default async function AdmissionCyclesPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const cycles = await db.admissionCycle.findMany({
      orderBy: { openAt: "desc" },
      include: { _count: { select: { applications: true } } },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("cyclesTitle")}
            action={
              <div className="flex items-center gap-3">
                <Link
                  href="/admissions-admin"
                  className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  {t("adminTitle")}
                </Link>
                <LinkButton
                  href="/admissions-admin/cycles/new"
                  size="sm"
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden />
                  {t("cyclesNewCta")}
                </LinkButton>
              </div>
            }
          />

          <Table>
            <THead>
              <tr>
                <TH>{t("cycleFieldLabel")}</TH>
                <TH>{t("cycleFieldTargetYear")}</TH>
                <TH>{t("cycleFieldOpenAt")}</TH>
                <TH>{t("cycleFieldCloseAt")}</TH>
                <TH className="text-end">{t("cycleFieldFee")}</TH>
                <TH className="text-end">{t("colChild")}</TH>
                <TH>{t("cycleFieldActive")}</TH>
                <TH className="text-end" />
              </tr>
            </THead>
            <tbody>
              {cycles.length === 0 ? (
                <EmptyRow colSpan={8}>—</EmptyRow>
              ) : (
                cycles.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link
                        href={`/admissions-admin/cycles/${c.id}`}
                        className="font-medium text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                      >
                        {c.label}
                      </Link>
                    </TD>
                    <TD className="text-[color:var(--color-foreground)]">
                      {c.targetYearLabel}
                    </TD>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {c.openAt.toISOString().slice(0, 10)}
                    </TD>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {c.closeAt ? c.closeAt.toISOString().slice(0, 10) : "—"}
                    </TD>
                    <TD className="text-end tabular-nums">
                      {c.inscriptionFeeCents && c.inscriptionFeeCents > 0
                        ? formatMoney(c.inscriptionFeeCents, c.currency)
                        : "—"}
                    </TD>
                    <TD className="text-end tabular-nums">
                      {c._count.applications > 0 ? (
                        <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-700)]">
                          {c._count.applications}
                        </span>
                      ) : (
                        <span className="text-[color:var(--color-foreground-subtle)]">
                          0
                        </span>
                      )}
                    </TD>
                    <TD>
                      {c.isActive ? (
                        <span className="inline-flex rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success-soft-fg)]">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                          —
                        </span>
                      )}
                    </TD>
                    <TD className="text-end">
                      <Link
                        href={`/admissions-admin/cycles/${c.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)] hover:underline"
                      >
                        <Sliders className="size-3.5" aria-hidden />
                        {t("configureCycle")}
                      </Link>
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}
