import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, FileText, HelpCircle, Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { parseFieldConfig } from "@/lib/admission-fields";
import { centsToDecimalString } from "@/lib/money";
import { updateCycle } from "../../_actions";
import { CycleGeneralInfoForm } from "./_general-info";
import { CustomQuestionsForm } from "./_custom-questions";
import { RequiredDocumentsForm } from "./_required-documents";
import { DeleteCycleButton } from "./_delete-cycle";

/*
 * NOTE: three sections used to live here that have moved to tenant-level
 * configuration and were removed from the UI in Phase 5 v2:
 *   1. Field config (per-cycle required/optional/hidden on built-in
 *      fields) → now /admin/inscription-config (WYSIWYG editor)
 *   2. Labels + step intros (per-cycle label overrides + intro text)
 *      → labels handled by WYSIWYG; step intros are dead since the
 *      10-tab dossier replaced the 3-step wizard.
 *   3. Field order (per-cycle reorder on legacy wizard fields) → dead
 *      with the wizard; a tenant-level drag-to-reorder is the v2 path.
 *
 * The underlying `cycle.fieldConfig` columns still parse those keys, so
 * any historical data is preserved — it just doesn't render or update.
 * The companion components (_field-config.tsx, _labels-intros.tsx,
 * _field-order.tsx) remain on disk as dead code; safe to delete in a
 * follow-up cleanup pass.
 */

export default async function CycleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const cycle = await db.admissionCycle.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        targetYearLabel: true,
        openAt: true,
        closeAt: true,
        schoolStartDate: true,
        inscriptionFeeCents: true,
        currency: true,
        description: true,
        isActive: true,
        fieldConfig: true,
        _count: { select: { applications: true } },
      },
    });
    if (!cycle) notFound();

    const config = parseFieldConfig(cycle.fieldConfig);
    const boundUpdate = updateCycle.bind(null, cycle.id);

    return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader
            title={cycle.label}
            description={`${t("cycleEditLead")} · ${cycle.targetYearLabel}`}
            action={
              <Link
                href="/admissions-admin/cycles"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {t("adminCycles")}
              </Link>
            }
          />

          <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
            <header className="flex items-start gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Info className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("cycleGeneralInfoTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("cycleGeneralInfoDescription")}
                </p>
              </div>
            </header>
            <div className="p-6">
              <CycleGeneralInfoForm
                cycleId={cycle.id}
                action={boundUpdate}
                initial={{
                  label: cycle.label,
                  targetYearLabel: cycle.targetYearLabel,
                  openAt: cycle.openAt.toISOString().slice(0, 10),
                  closeAt: cycle.closeAt
                    ? cycle.closeAt.toISOString().slice(0, 10)
                    : "",
                  schoolStartDate: cycle.schoolStartDate
                    ? cycle.schoolStartDate.toISOString().slice(0, 10)
                    : "",
                  inscriptionFee: cycle.inscriptionFeeCents
                    ? centsToDecimalString(cycle.inscriptionFeeCents)
                    : "",
                  currency: cycle.currency,
                  description: cycle.description ?? "",
                  isActive: cycle.isActive,
                }}
              />
            </div>
          </section>

          <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
            <header className="flex items-start gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <HelpCircle className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("customQuestionsTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("customQuestionsDescription")}
                </p>
              </div>
            </header>
            <div className="p-6">
              <CustomQuestionsForm
                cycleId={cycle.id}
                initial={config.customQuestions ?? []}
              />
            </div>
          </section>

          <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
            <header className="flex items-start gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <FileText className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("requiredDocsTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("requiredDocsDescription")}
                </p>
              </div>
            </header>
            <div className="p-6">
              <RequiredDocumentsForm
                cycleId={cycle.id}
                initial={config.requiredDocuments ?? []}
              />
            </div>
          </section>

          <DeleteCycleButton
            cycleId={cycle.id}
            cycleLabel={cycle.label}
            applicationCount={cycle._count.applications}
          />
        </main>
    );
  });
}
