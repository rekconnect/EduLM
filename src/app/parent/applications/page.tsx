import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

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

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
  DECLINED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-zinc-200 text-zinc-700",
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
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("myApplicationsTitle")}
            description={t("myApplicationsLead")}
            action={
              <LinkButton href="/parent/applications/new" size="sm">
                + {t("newCta")}
              </LinkButton>
            }
          />

          {apps.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noApplications")}</p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-3">
              {apps.map((a) => {
                const href =
                  a.status === "DRAFT"
                    ? `/parent/applications/${a.id}/edit`
                    : `/parent/applications/${a.id}`;
                return (
                  <Link key={a.id} href={href} className="block">
                    <Card className="transition hover:border-[color:var(--primary)]">
                      <CardBody>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[color:var(--muted-fg)]">
                              {a.cycle.label}
                            </p>
                            <h2 className="mt-1 text-lg font-semibold">
                              {a.childFirstName || "—"} {a.childLastName || ""}
                              {a.existingStudentId ? (
                                <span className="ms-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">
                                  {t("renewalBadge")}
                                </span>
                              ) : null}
                            </h2>
                            <p className="mt-0.5 text-xs text-[color:var(--muted-fg)]">
                              {a.requestedLevel ? `${a.requestedLevel} · ` : ""}
                              {a.cycle.targetYearLabel}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              STATUS_TONE[a.status]
                            }`}
                          >
                            {t(STATUS_KEY[a.status] ?? "statusDraft")}
                          </span>
                        </div>
                      </CardBody>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </AppShell>
    );
  });
}
