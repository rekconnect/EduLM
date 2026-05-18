import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { MarkReadButton } from "./_mark-read";

export default async function ParentAnnouncementsPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("communication");

    // Allowed classes/years from the parent's kids' active enrollments.
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
          { audience: "CLASS", classId: { in: classIds.length > 0 ? classIds : ["__none__"] } },
          { audience: "ACADEMIC_YEAR", academicYearId: { in: yearIds.length > 0 ? yearIds : ["__none__"] } },
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
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("announcementsTitle")}
            description={t("announcementsParentLead")}
          />

          {announcements.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">
                  {t("parentEmptyAnnouncements")}
                </p>
              </CardBody>
            </Card>
          ) : (
            announcements.map((a) => {
              const readAt = a.reads[0]?.readAt ?? null;
              const unread = !readAt;
              return (
                <Card
                  key={a.id}
                  className={unread ? "border-[color:var(--primary)]" : ""}
                >
                  <CardHeader
                    title={a.title}
                    description={a.publishedAt.toISOString().slice(0, 10)}
                    action={
                      unread ? (
                        <span className="inline-flex rounded-full bg-[color:var(--primary)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--primary-foreground)]">
                          {t("newBadge")}
                        </span>
                      ) : (
                        <span className="text-xs text-[color:var(--muted-fg)]">
                          ✓ {t("readAt", { date: readAt!.toISOString().slice(0, 10) })}
                        </span>
                      )
                    }
                  />
                  <CardBody className="space-y-3">
                    <p className="whitespace-pre-line text-sm leading-relaxed">{a.body}</p>
                    {unread ? (
                      <div className="flex justify-end">
                        <MarkReadButton announcementId={a.id} />
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              );
            })
          )}
        </main>
      </AppShell>
    );
  });
}
