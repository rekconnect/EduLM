import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Stat } from "@/components/ui/card";
import { db } from "@/lib/db";
import { unscopedDb } from "@/lib/db";
import { withTenantSession } from "@/lib/session";

export default async function DashboardPage() {
  return withTenantSession(async (user) => {
    const t = await getTranslations("dashboard");

    // Tenant lookup uses unscoped client (we look up by id, no implicit scoping).
    const unscoped = unscopedDb();
    let tenantName = "";
    try {
      const tenant = await unscoped.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true },
      });
      tenantName = tenant?.name ?? "";
    } finally {
      await unscoped.$disconnect();
    }

    // 7-day attendance window for the dashboard absence counter.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);
    since.setUTCHours(0, 0, 0, 0);

    // Everything below uses the auto-scoped `db` — Prisma extension injects
    // the tenant filter from AsyncLocalStorage on every query.
    const [students, classes, teachers, parents, activeYear, absencesWeek, disciplineWeek] =
      await Promise.all([
        db.student.count({ where: { status: "ENROLLED" } }),
        db.class.count(),
        db.user.count({ where: { role: "TEACHER" } }),
        db.user.count({ where: { role: "PARENT" } }),
        db.academicYear.findFirst({ where: { isActive: true }, select: { label: true } }),
        db.attendanceRecord.count({ where: { date: { gte: since }, status: "ABSENT" } }),
        db.disciplineEvent.count({ where: { date: { gte: since } } }),
      ]);

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} tenantLabel={tenantName} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <PageHeader
            title={t("welcome", { name: user.name ?? user.email })}
            description={activeYear ? activeYear.label : t("noActiveYear")}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("statStudents")} value={students} />
            <Stat label={t("statClasses")} value={classes} />
            <Stat label={t("statTeachers")} value={teachers} />
            <Stat label={t("statParents")} value={parents} />
            <Stat label={t("statAbsencesWeek")} value={absencesWeek} />
            <Stat label={t("statIncidentsWeek")} value={disciplineWeek} />
          </div>
        </main>
      </div>
    );
  });
}
