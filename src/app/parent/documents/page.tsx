import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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

    // Figure out which classes / years the parent's children are enrolled in.
    let allowedClassIds: string[] = [];
    let allowedYearIds: string[] = [];
    if (childIds.length > 0) {
      const enrollments = await db.enrollment.findMany({
        where: { studentId: { in: childIds } },
        select: { classId: true, academicYearId: true },
      });
      allowedClassIds = Array.from(new Set(enrollments.map((e) => e.classId)));
      allowedYearIds = Array.from(new Set(enrollments.map((e) => e.academicYearId)));
    }

    // Docs targeted at the parent: ALL_PARENTS, or matching their kids' classes/years.
    const docs = await db.tenantDocument.findMany({
      where: {
        unpublishedAt: null,
        OR: [
          { audience: "ALL_PARENTS" },
          { audience: "CLASS", classId: { in: allowedClassIds.length > 0 ? allowedClassIds : ["__none__"] } },
          { audience: "ACADEMIC_YEAR", academicYearId: { in: allowedYearIds.length > 0 ? allowedYearIds : ["__none__"] } },
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

    // Pre-sign download URLs (only for stored docs).
    const withUrls = await Promise.all(
      docs.map(async (d) => {
        const url = d.storagePath
          ? await getSignedDownloadUrl(d.storagePath)
          : d.externalUrl;
        return { ...d, downloadUrl: url };
      }),
    );

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
          <PageHeader title={t("parentTitle")} description={t("parentLead")} />

          {withUrls.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("parentEmpty")}</p>
              </CardBody>
            </Card>
          ) : (
            withUrls.map((d) => {
              const ackedAt = d.acknowledgments[0]?.acknowledgedAt ?? null;
              return (
                <Card key={d.id}>
                  <CardHeader
                    title={d.title}
                    description={`${t(CATEGORY_KEY[d.category] ?? "categoryOther")} · ${d.publishedAt.toISOString().slice(0, 10)}`}
                  />
                  <CardBody className="space-y-3">
                    {d.description ? (
                      <p className="text-sm text-[color:var(--muted-fg)]">{d.description}</p>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {d.downloadUrl ? (
                          <a
                            href={d.downloadUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[color:var(--muted)]"
                          >
                            ↓ {d.storagePath ? t("download") : t("openLink")}
                          </a>
                        ) : (
                          <span className="text-xs text-[color:var(--muted-fg)]">—</span>
                        )}
                        {d.requiresAck ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {t("ackRequired")}
                          </span>
                        ) : null}
                      </div>

                      {d.requiresAck ? (
                        ackedAt ? (
                          <span className="text-xs text-emerald-600">
                            ✓ {t("ackedAt", { date: ackedAt.toISOString().slice(0, 10) })}
                          </span>
                        ) : (
                          <AcknowledgeButton documentId={d.id} />
                        )
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              );
            })
          )}
        </main>
      </div>
    );
  });
}
