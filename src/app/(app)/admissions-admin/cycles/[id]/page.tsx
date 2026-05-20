import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowUpDown, FileText, HelpCircle, Info, Sliders, Type } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { WIZARD_STEPS, fieldsForStep, parseFieldConfig } from "@/lib/admission-fields";
import { centsToDecimalString } from "@/lib/money";
import { updateCycle } from "../../_actions";
import { CycleGeneralInfoForm } from "./_general-info";
import { FieldConfigForm } from "./_field-config";
import { CustomQuestionsForm } from "./_custom-questions";
import { RequiredDocumentsForm } from "./_required-documents";
import { LabelsAndIntrosForm } from "./_labels-intros";
import { FieldOrderForm } from "./_field-order";

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
        inscriptionFeeCents: true,
        currency: true,
        description: true,
        isActive: true,
        fieldConfig: true,
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
                <Sliders className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("fieldConfigTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("fieldConfigDescription")}
                </p>
              </div>
            </header>
            <div className="p-6">
              <FieldConfigForm
                cycleId={cycle.id}
                steps={WIZARD_STEPS.map((step) => ({
                  step,
                  fields: fieldsForStep(step).map((f) => ({
                    key: f.key,
                    labelKey: f.labelKey,
                    locked: !!f.locked,
                    current: f.locked
                      ? "required"
                      : (config.fields?.[f.key] ?? f.default),
                  })),
                }))}
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

          <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
            <header className="flex items-start gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Type className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("labelsTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("labelsDescription")}
                </p>
              </div>
            </header>
            <div className="p-6">
              <LabelsAndIntrosForm
                cycleId={cycle.id}
                steps={WIZARD_STEPS.map((step) => ({
                  step,
                  fields: fieldsForStep(step).map((f) => ({
                    key: f.key,
                    labelKey: f.labelKey,
                    defaultLabelFallback: t(f.labelKey),
                  })),
                }))}
                initialLabels={config.customLabels ?? {}}
                initialIntros={config.stepIntros ?? {}}
              />
            </div>
          </section>

          <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
            <header className="flex items-start gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <ArrowUpDown className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("fieldOrderTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("fieldOrderDescription")}
                </p>
              </div>
            </header>
            <div className="p-6">
              <FieldOrderForm
                cycleId={cycle.id}
                steps={WIZARD_STEPS.map((step) => ({
                  step,
                  fields: fieldsForStep(step).map((f) => ({
                    key: f.key,
                    labelKey: f.labelKey,
                  })),
                  defaultOrder: fieldsForStep(step).map((f) => f.key),
                }))}
                initialOrder={config.fieldOrder ?? {}}
              />
            </div>
          </section>
        </main>
    );
  });
}
