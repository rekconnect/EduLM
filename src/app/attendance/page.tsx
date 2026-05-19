import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarCheck, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
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
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso();

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
            initialLateMinutes:
              r?.lateMinutes != null ? String(r.lateMinutes) : "",
            initialNote: r?.note ?? "",
          };
        });
      }
    }

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={
              activeYear ? `${t("subtitle")} — ${activeYear.label}` : t("subtitle")
            }
          />

          <Card>
            <CardBody>
              <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
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
                  <Button
                    type="submit"
                    variant="secondary"
                    className="gap-1.5"
                    aria-label="Refresh"
                  >
                    <RefreshCw className="size-4" aria-hidden />
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {!classId || !rosterStudents ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <CalendarCheck className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("noClass")}
              </p>
            </div>
          ) : (
            <Card>
              <CardHeader
                title={`${selectedClassName} · ${date}`}
                action={
                  <Link
                    href="/classes"
                    className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
                  >
                    <ArrowLeft className="size-3.5" aria-hidden />
                    /classes
                  </Link>
                }
              />
              <CardBody>
                <AttendanceRoster
                  classId={classId}
                  date={date}
                  students={rosterStudents}
                />
              </CardBody>
            </Card>
          )}
        </main>
      </AppShell>
    );
  });
}
