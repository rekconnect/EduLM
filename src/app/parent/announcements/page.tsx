import { getTranslations } from "next-intl/server";
import { Megaphone, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StaggerGrid } from "@/components/ui/stagger-grid";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { MarkReadButton } from "./_mark-read";

export default async function ParentAnnouncementsPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("communication");

    let classIds: string[] = [];
    let yearIds: string[] = [];
    if (childIds.length > 0) {
      const enrollments = await db.enrollment.findMany({
        where: { studentId: { in: childIds } },
        select: { classId: true, academicYearId: true },
      });
      classIds = Array.from(new Set(enrollments.map((e) => e.classId)));
      yearIds = Array.from(new Set(enrollments.map((e) => e.academicYearId)));
    }

    const announcements = await db.announcement.findMany({
      where: {
        OR: [
          { audience: "ALL_PARENTS" },
          {
            audience: "CLASS",
            classId: { in: classIds.length > 0 ? classIds : ["__none__"] },
          },
          {
            audience: "ACADEMIC_YEAR",
            academicYearId: {
              in: yearIds.length > 0 ? yearIds : ["__none__"],
            },
          },
        ],
      },
      orderBy: { publishedAt: "desc" },
      include: {
        reads: {
          where: { userId: user.id },
          select: { readAt: true },
        },
      },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("announcementsTitle")}
            description={t("announcementsParentLead")}
          />

          {announcements.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Megaphone className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("parentEmptyAnnouncements")}
              </p>
            </div>
          ) : (
            <StaggerGrid className="space-y-4">
              {announcements.map((a) => {
                const readAt = a.reads[0]?.readAt ?? null;
                const unread = !readAt;
                return (
                  <Card
                    key={a.id}
                    className={cn(
                      "transition-shadow duration-200 ease-out hover:shadow-[var(--shadow-card-hover)]",
                      unread &&
                        "border-[color:var(--color-brand-500)] shadow-card",
                    )}
                  >
                    <CardHeader
                      title={a.title}
                      description={a.publishedAt.toISOString().slice(0, 10)}
                      action={
                        unread ? (
                          <span className="inline-flex items-center rounded-full bg-[color:var(--color-brand-500)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-onbrand)]">
                            {t("newBadge")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-muted)]">
                            <CheckCircle2 className="size-3" aria-hidden />
                            {t("readAt", {
                              date: readAt!.toISOString().slice(0, 10),
                            })}
                          </span>
                        )
                      }
                    />
                    <CardBody className="space-y-3">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--color-foreground)]">
                        {a.body}
                      </p>
                      {unread ? (
                        <div className="flex justify-end">
                          <MarkReadButton announcementId={a.id} />
                        </div>
                      ) : null}
                    </CardBody>
                  </Card>
                );
              })}
            </StaggerGrid>
          )}
        </main>
      </AppShell>
    );
  });
}
