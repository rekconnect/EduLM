import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { deleteStudent, updateStudent } from "../_actions";
import { StudentForm } from "../_form";

const SEVERITY_LABEL: Record<string, string> = {
  NOTE: "severityNote",
  WARNING: "severityWarning",
  DETENTION: "severityDetention",
  SUSPENSION: "severitySuspension",
};

const SEVERITY_TONE: Record<string, string> = {
  NOTE: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  WARNING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  DETENTION: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  SUSPENSION: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
};

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withTenantSession(async (user) => {
    const t = await getTranslations("students");
    const tCommon = await getTranslations("common");
    const tAtt = await getTranslations("attendance");
    const tDisc = await getTranslations("discipline");

    const student = await db.student.findUnique({
      where: { id },
      include: {
        guardianLinks: {
          include: {
            guardian: { include: { user: { select: { email: true, name: true } } } },
          },
        },
        enrollments: {
          include: {
            class: { select: { name: true } },
            academicYear: { select: { label: true, isActive: true } },
          },
          orderBy: { enrolledAt: "desc" },
        },
      },
    });

    if (!student) notFound();

    // 30-day attendance window for the summary stats.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);

    const attendanceCounts = await db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: id, date: { gte: since } },
      _count: { status: true },
    });
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<string, number>;
    for (const row of attendanceCounts) counts[row.status] = row._count.status;

    const discipline = await db.disciplineEvent.findMany({
      where: { studentId: id },
      orderBy: { date: "desc" },
      take: 10,
      include: { reportedBy: { select: { name: true, email: true } } },
    });

    const boundUpdate = updateStudent.bind(null, id);
    const boundDelete = deleteStudent.bind(null, id);

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${student.lastName} ${student.firstName}`}
            description={t("editTitle")}
            action={
              <Link
                href="/students"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {tCommon("back")}
              </Link>
            }
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={tAtt("presentCount")} value={counts.PRESENT!} />
            <Stat label={tAtt("absentCount")} value={counts.ABSENT!} />
            <Stat label={tAtt("lateCount")} value={counts.LATE!} />
          </div>

          <Card>
            <CardBody>
              <StudentForm
                action={boundUpdate}
                initial={{
                  firstName: student.firstName,
                  lastName: student.lastName,
                  dob: student.dob ? student.dob.toISOString().slice(0, 10) : "",
                  status: student.status,
                }}
                submitLabel={tCommon("save")}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("guardiansTitle")} />
            <CardBody>
              {student.guardianLinks.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noGuardians")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {student.guardianLinks.map((link) => (
                    <li key={link.guardianId} className="flex items-center justify-between">
                      <span>
                        <span className="font-medium">
                          {link.guardian.user.name ?? link.guardian.user.email}
                        </span>{" "}
                        <span className="text-[color:var(--muted-fg)]">
                          {link.guardian.user.email}
                        </span>
                      </span>
                      {link.isPrimary ? (
                        <span className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-xs text-[color:var(--primary)]">
                          Primary
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("enrollmentsTitle")} />
            <CardBody>
              {student.enrollments.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noEnrollments")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {student.enrollments.map((e) => (
                    <li key={e.id} className="flex items-center justify-between">
                      <span>
                        <span className="font-medium">{e.class.name}</span>{" "}
                        <span className="text-[color:var(--muted-fg)]">{e.academicYear.label}</span>
                      </span>
                      {e.academicYear.isActive ? (
                        <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs">
                          Active
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={tDisc("summaryTitle")}
              action={
                <LinkButton href={`/discipline/new?studentId=${id}`} size="sm" variant="secondary">
                  {tDisc("createCta")}
                </LinkButton>
              }
            />
            <CardBody>
              {discipline.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-fg)]">{tDisc("empty")}</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {discipline.map((d) => (
                    <li key={d.id} className="border-b border-[color:var(--border)] pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{d.type}</span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              SEVERITY_TONE[d.severity]
                            }`}
                          >
                            {tDisc(SEVERITY_LABEL[d.severity] ?? "severityNote")}
                          </span>
                        </div>
                        <span className="text-xs text-[color:var(--muted-fg)]">
                          {d.date.toISOString().slice(0, 10)}
                        </span>
                      </div>
                      <p className="mt-1 text-[color:var(--muted-fg)]">{d.description}</p>
                      <p className="mt-0.5 text-xs text-[color:var(--muted-fg)]">
                        — {d.reportedBy.name ?? d.reportedBy.email}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {user.role === "SCHOOL_ADMIN" ? (
            <form action={boundDelete} className="flex justify-end">
              <Button variant="danger" size="sm" type="submit">
                {tCommon("delete")}
              </Button>
            </form>
          ) : null}
        </main>
      </div>
    );
  });
}
