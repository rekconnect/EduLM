import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { deleteStudent, updateStudent } from "../_actions";
import { StudentForm } from "../_form";
import { GuardianManager, type ParentOption } from "./_guardian-link";
import { listEstablishments, loadEntityFieldsConfig } from "../../settings/_actions";
import { StudentCustomAnswersForm } from "./_custom-answers";

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

    // 30-day attendance window for the summary stats.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);

    // All queries only need the URL `id` (or no input at all) — fire in
    // parallel. Cuts wall time substantially on this page. On a 404 we
    // waste a few extra queries; rare enough to ignore.
    const [
      student,
      availableParentsRaw,
      attendanceCounts,
      discipline,
      studentFieldsConfig,
      establishmentsRaw,
    ] = await Promise.all([
        db.student.findUnique({
          where: { id },
          include: {
            family: { select: { code: true } },
            guardianLinks: {
              include: {
                guardian: {
                  select: {
                    id: true,
                    userId: true,
                    user: { select: { email: true, name: true } },
                  },
                },
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
        }),
        db.user.findMany({
          where: { role: "PARENT", status: { in: ["ACTIVE", "INVITED"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        }),
        db.attendanceRecord.groupBy({
          by: ["status"],
          where: { studentId: id, date: { gte: since } },
          _count: { status: true },
        }),
        db.disciplineEvent.findMany({
          where: { studentId: id },
          orderBy: { date: "desc" },
          take: 10,
          include: { reportedBy: { select: { name: true, email: true } } },
        }),
        loadEntityFieldsConfig("student"),
        listEstablishments(),
      ]);

    if (!student) notFound();

    const establishmentsForRenderer = establishmentsRaw
      .filter((e) => e.isActive)
      .map((e) => ({
        id: e.id,
        name: e.name,
        levels: Array.isArray(e.levels)
          ? (e.levels.filter((x) => typeof x === "string") as string[])
          : [],
      }));

    // Coerce Student.customAnswers (Json) into a flat string map.
    const initialStudentAnswers: Record<string, string> = {};
    if (student.customAnswers && typeof student.customAnswers === "object") {
      for (const [k, v] of Object.entries(
        student.customAnswers as Record<string, unknown>,
      )) {
        if (typeof v === "string") initialStudentAnswers[k] = v;
        else if (v != null) initialStudentAnswers[k] = String(v);
      }
    }

    // Parents available to link (anyone with role=PARENT in this tenant who isn't
    // already linked to this student).
    const linkedParentUserIds = new Set(student.guardianLinks.map((l) => l.guardian.userId));
    const availableParents: ParentOption[] = availableParentsRaw.filter(
      (p) => !linkedParentUserIds.has(p.id),
    );

    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<string, number>;
    for (const row of attendanceCounts) counts[row.status] = row._count.status;

    const boundUpdate = updateStudent.bind(null, id);
    const boundDelete = deleteStudent.bind(null, id);

    return (
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${student.lastName} ${student.firstName}`}
            description={
              student.family?.code
                ? `${t("editTitle")} · Code famille ${student.family.code}`
                : t("editTitle")
            }
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
                  gender: student.gender ?? "",
                  nationality: student.nationality,
                  placeOfBirth: student.placeOfBirth,
                  address: student.address,
                  city: student.city,
                  postalCode: student.postalCode,
                  country: student.country,
                  previousSchool: student.previousSchool,
                  emergencyContact: student.emergencyContact,
                  internalNotes: student.internalNotes,
                }}
                submitLabel={tCommon("save")}
              />
            </CardBody>
          </Card>

          {studentFieldsConfig.fields.length > 0 ? (
            <Card>
              <CardHeader title={t("customFieldsTitle")} />
              <CardBody>
                <StudentCustomAnswersForm
                  studentId={student.id}
                  config={studentFieldsConfig}
                  initialAnswers={initialStudentAnswers}
                  extras={{ establishments: establishmentsForRenderer }}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("guardiansTitle")} />
            <CardBody>
              <GuardianManager
                studentId={id}
                guardians={student.guardianLinks.map((l) => ({
                  guardianId: l.guardianId,
                  parentUserId: l.guardian.userId,
                  name: l.guardian.user.name,
                  email: l.guardian.user.email,
                  isPrimary: l.isPrimary,
                }))}
                availableParents={availableParents}
                canEdit={user.role === "SCHOOL_ADMIN"}
              />
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
    );
  });
}
