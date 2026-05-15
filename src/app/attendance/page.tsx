import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select, Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { AttendanceRoster, type RosterStudent } from "./_roster";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const { classId, date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso();

  return withTenantSession(async (user) => {
    const t = await getTranslations("attendance");

    const activeYear = await db.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, label: true },
    });

    const classes = activeYear
      ? await db.class.findMany({
          where: { academicYearId: activeYear.id },
          orderBy: [{ level: "asc" }, { section: "asc" }],
          select: { id: true, name: true },
        })
      : [];

    let rosterStudents: RosterStudent[] | null = null;
    let selectedClassName = "";

    if (classId) {
      const klass = await db.class.findUnique({
        where: { id: classId },
        select: {
          name: true,
          academicYearId: true,
          enrollments: {
            select: {
              student: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { student: { lastName: "asc" } },
          },
        },
      });

      if (klass) {
        selectedClassName = klass.name;
        const day = new Date(`${date}T00:00:00.000Z`);
        const existing = await db.attendanceRecord.findMany({
          where: {
            date: day,
            studentId: { in: klass.enrollments.map((e) => e.student.id) },
          },
          select: { studentId: true, status: true, lateMinutes: true, note: true },
        });
        const byId = new Map(existing.map((r) => [r.studentId, r]));

        rosterStudents = klass.enrollments.map(({ student }) => {
          const r = byId.get(student.id);
          return {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            initialStatus: (r?.status ?? "PRESENT") as RosterStudent["initialStatus"],
            initialLateMinutes: r?.lateMinutes != null ? String(r.lateMinutes) : "",
            initialNote: r?.note ?? "",
          };
        });
      }
    }

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader title={t("title")} description={activeYear ? `${t("subtitle")} — ${activeYear.label}` : t("subtitle")} />

          <Card>
            <CardBody>
              <form method="get" className="grid gap-4 sm:grid-cols-3">
                <Field label={t("pickClass")} htmlFor="classId">
                  <Select id="classId" name="classId" defaultValue={classId ?? ""}>
                    <option value="">—</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("pickDate")} htmlFor="date">
                  <Input id="date" name="date" type="date" defaultValue={date} />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" variant="secondary">↻</Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {!classId || !rosterStudents ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noClass")}</p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={`${selectedClassName} · ${date}`}
                action={
                  <Link
                    href="/classes"
                    className="text-sm text-[color:var(--muted-fg)] hover:underline"
                  >
                    ← /classes
                  </Link>
                }
              />
              <CardBody>
                <AttendanceRoster classId={classId} date={date} students={rosterStudents} />
              </CardBody>
            </Card>
          )}
        </main>
      </div>
    );
  });
}
