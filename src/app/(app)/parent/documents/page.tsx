import { getTranslations } from "next-intl/server";
import { CheckCircle2, Download, ExternalLink, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StaggerGrid } from "@/components/ui/stagger-grid";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { getSignedDownloadUrl } from "@/lib/storage";
import { AcknowledgeButton } from "./_ack-button";

const CATEGORY_KEY: Record<string, string> = {
  REGULATION: "categoryRegulation",
  CALENDAR: "categoryCalendar",
  FORM: "categoryForm",
  NEWSLETTER: "categoryNewsletter",
  OTHER: "categoryOther",
};

export default async function ParentDocumentsPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("documents");

    let allowedClassIds: string[] = [];
    let allowedYearIds: string[] = [];
    if (childIds.length > 0) {
      const enrollments = await db.enrollment.findMany({
        where: { studentId: { in: childIds } },
        select: { classId: true, academicYearId: true },
      });
      allowedClassIds = Array.from(new Set(enrollments.map((e) => e.classId)));
      allowedYearIds = Array.from(
        new Set(enrollments.map((e) => e.academicYearId)),
      );
    }

    const docs = await db.tenantDocument.findMany({
      where: {
        unpublishedAt: null,
        OR: [
          { audience: "ALL_PARENTS" },
          {
            audience: "CLASS",
            classId: {
              in: allowedClassIds.length > 0 ? allowedClassIds : ["__none__"],
            },
          },
          {
            audience: "ACADEMIC_YEAR",
            academicYearId: {
              in: allowedYearIds.length > 0 ? allowedYearIds : ["__none__"],
            },
          },
        ],
      },
      orderBy: { publishedAt: "desc" },
      include: {
        acknowledgments: {
          where: { userId: user.id },
          select: { acknowledgedAt: true },
        },
      },
    });

    const withUrls = await Promise.all(
      docs.map(async (d) => {
        const url = d.storagePath
          ? await getSignedDownloadUrl(d.storagePath)
          : d.externalUrl;
        return { ...d, downloadUrl: url };
      }),
    );

    return (
        <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
          <PageHeader title={t("parentTitle")} description={t("parentLead")} />

          {withUrls.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <FolderOpen className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("parentEmpty")}
              </p>
            </div>
          ) : (
            <StaggerGrid className="space-y-4">
              {withUrls.map((d) => {
                const ackedAt =
                  d.acknowledgments[0]?.acknowledgedAt ?? null;
                return (
                  <Card
                    key={d.id}
                    className="transition-shadow duration-200 ease-out hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <CardHeader
                      title={d.title}
                      description={`${t(CATEGORY_KEY[d.category] ?? "categoryOther")} · ${d.publishedAt.toISOString().slice(0, 10)}`}
                    />
                    <CardBody className="space-y-3">
                      {d.description ? (
                        <p className="text-sm text-[color:var(--color-foreground-muted)]">
                          {d.description}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {d.downloadUrl ? (
                            <a
                              href={d.downloadUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
                            >
                              {d.storagePath ? (
                                <Download className="size-3.5" aria-hidden />
                              ) : (
                                <ExternalLink className="size-3.5" aria-hidden />
                              )}
                              {d.storagePath ? t("download") : t("openLink")}
                            </a>
                          ) : (
                            <span className="text-xs text-[color:var(--color-foreground-subtle)]">
                              —
                            </span>
                          )}
                          {d.requiresAck ? (
                            <span className="inline-flex rounded-full bg-[color:var(--color-warning-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-warning-soft-fg)]">
                              {t("ackRequired")}
                            </span>
                          ) : null}
                        </div>

                        {d.requiresAck ? (
                          ackedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-success)]">
                              <CheckCircle2 className="size-3.5" aria-hidden />
                              {t("ackedAt", {
                                date: ackedAt.toISOString().slice(0, 10),
                              })}
                            </span>
                          ) : (
                            <AcknowledgeButton documentId={d.id} />
                          )
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </StaggerGrid>
          )}
        </main>
    );
  });
}
