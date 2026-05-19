import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { db, unscopedDb } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { DashboardStats } from "./_stats";

export default async function DashboardPage() {
  return withTenantSession(async (user) => {
    if (user.role === "PARENT") redirect("/parent/dashboard");
    const t = await getTranslations("dashboard");

    // Tenant lookup uses unscoped client (we look up by id, no implicit scoping).
    const unscoped = unscopedDb();
    const tenant = await unscoped.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name ?? "";

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
      <AppShell role={user.role} userLabel={user.name ?? user.email} tenantLabel={tenantName}>
        <main className="mx-auto max-w-6xl px-6 py-10">
          <PageHeader
            title={t("welcome", { name: user.name ?? user.email })}
            description={activeYear ? activeYear.label : t("noActiveYear")}
          />
          <DashboardStats
            students={students}
            classes={classes}
            teachers={teachers}
            parents={parents}
            absencesWeek={absencesWeek}
            disciplineWeek={disciplineWeek}
          />
        </main>
      </AppShell>
    );
  });
}
