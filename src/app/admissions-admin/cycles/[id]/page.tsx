import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Sliders } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { WIZARD_STEPS, fieldsForStep, parseFieldConfig } from "@/lib/admission-fields";
import { FieldConfigForm } from "./_field-config";

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
        fieldConfig: true,
      },
    });
    if (!cycle) notFound();

    const config = parseFieldConfig(cycle.fieldConfig);

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
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
        </main>
      </AppShell>
    );
  });
}
