import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Plus, RefreshCw, FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { StaggerGrid } from "@/components/ui/stagger-grid";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { AppStatusBadge } from "./_status-badge";

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  SUBMITTED: "statusSubmitted",
  UNDER_REVIEW: "statusUnderReview",
  INTERVIEW_SCHEDULED: "statusInterview",
  ACCEPTED: "statusAccepted",
  WAITLISTED: "statusWaitlisted",
  DECLINED: "statusDeclined",
  WITHDRAWN: "statusWithdrawn",
};

export default async function ParentApplicationsPage() {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const apps = await db.application.findMany({
      where: { submittedByUserId: user.id },
      orderBy: { createdAt: "desc" },
      include: { cycle: { select: { label: true, targetYearLabel: true } } },
    });

    return (
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("myApplicationsTitle")}
            description={t("myApplicationsLead")}
            action={
              <LinkButton href="/parent/applications/new" size="sm" className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                {t("newCta")}
              </LinkButton>
            }
          />

          {apps.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <FileText className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("noApplications")}
              </p>
              <div className="mt-5">
                <LinkButton href="/parent/applications/new" size="sm" className="gap-1.5">
                  <Plus className="size-4" aria-hidden />
                  {t("newCta")}
                </LinkButton>
              </div>
            </div>
          ) : (
            <StaggerGrid className="space-y-3">
              {apps.map((a) => {
                // DRAFT/SUBMITTED open in the new tenant-fields wizard so
                // every application uses the same editing surface. Decided
                // states (ACCEPTED/DECLINED/...) still route to the read-only
                // detail view.
                const editable =
                  a.status === "DRAFT" || a.status === "SUBMITTED";
                const href = editable
                  ? `/parent/inscriptions/${a.id}/edit`
                  : `/parent/applications/${a.id}`;
                return (
                  <Link key={a.id} href={href} className="block">
                    <Card className="group transition-shadow duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]">
                      <CardBody>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                              {a.cycle.label}
                            </p>
                            <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[color:var(--color-foreground)] transition-colors group-hover:text-[color:var(--color-brand-600)]">
                              {a.childFirstName || "—"} {a.childLastName || ""}
                              {a.existingStudentId ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-brand-700)]">
                                  <RefreshCw className="size-2.5" aria-hidden />
                                  {t("renewalBadge")}
                                </span>
                              ) : null}
                            </h2>
                            <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
                              {a.requestedLevel ? `${a.requestedLevel} · ` : ""}
                              {a.cycle.targetYearLabel}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <AppStatusBadge
                              status={a.status}
                              label={t(STATUS_KEY[a.status] ?? "statusDraft")}
                            />
                            <ArrowRight
                              className="size-4 text-[color:var(--color-foreground-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--color-brand-600)] rtl:group-hover:-translate-x-0.5 rtl:rotate-180"
                              aria-hidden
                            />
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  </Link>
                );
              })}
            </StaggerGrid>
          )}
        </main>
    );
  });
}
