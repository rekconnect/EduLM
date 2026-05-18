import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("cyclesTitle")}
            action={
              <div className="flex items-center gap-2">
                <Link href="/admissions-admin" className="text-sm text-[color:var(--muted-fg)] hover:underline">
                  ← {t("adminTitle")}
                </Link>
                <LinkButton href="/admissions-admin/cycles/new" size="sm">
                  + {t("cyclesNewCta")}
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
                <TH className="text-right">{t("cycleFieldFee")}</TH>
                <TH className="text-right">{t("colChild")}</TH>
                <TH>{t("cycleFieldActive")}</TH>
              </tr>
            </THead>
            <tbody>
              {cycles.length === 0 ? (
                <EmptyRow colSpan={7}>—</EmptyRow>
              ) : (
                cycles.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.label}</TD>
                    <TD>{c.targetYearLabel}</TD>
                    <TD className="text-[color:var(--muted-fg)] tabular-nums">
                      {c.openAt.toISOString().slice(0, 10)}
                    </TD>
                    <TD className="text-[color:var(--muted-fg)] tabular-nums">
                      {c.closeAt ? c.closeAt.toISOString().slice(0, 10) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.inscriptionFeeCents && c.inscriptionFeeCents > 0
                        ? formatMoney(c.inscriptionFeeCents, c.currency)
                        : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">{c._count.applications}</TD>
                    <TD>
                      {c.isActive ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          —
                        </span>
                      )}
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
