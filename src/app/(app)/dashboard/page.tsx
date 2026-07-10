import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { DashboardStats } from "./_stats";

export default async function DashboardPage() {
  return withTenantSession(async (user) => {
    if (user.role === "PARENT") redirect("/parent/dashboard");
    const t = await getTranslations("dashboard");

    // Everything below uses the auto-scoped `db` — Prisma extension injects
    // the tenant filter from AsyncLocalStorage on every query.
    const [students, classes, teachers, parents, activeYear] = await Promise.all([
      // Students enrolled in the ACTIVE year — not a global status count.
      // `status: "ENROLLED"` over-counts once next year's incoming pupils
      // (already enrolled for the upcoming year) are marked ENROLLED too.
      db.student.count({
        where: { enrollments: { some: { academicYear: { isActive: true } } } },
      }),
      // Only the ACTIVE year's classes — each year carries its own Class
      // rows, so a bare count() sums all years (268 instead of ~67).
      db.class.count({ where: { academicYear: { isActive: true } } }),
      db.user.count({ where: { role: "TEACHER" } }),
      // Parents of ACTIVE-year pupils — not every parent account ever created.
      // A bare role: "PARENT" count includes parents of graduated/departed
      // students, so it never changes with the year (2052 vs ~1240).
      db.user.count({
        where: {
          role: "PARENT",
          guardianProfile: {
            childLinks: {
              some: {
                student: { enrollments: { some: { academicYear: { isActive: true } } } },
              },
            },
          },
        },
      }),
      db.academicYear.findFirst({ where: { isActive: true }, select: { label: true } }),
    ]);

    return (
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
          />
        </main>
    );
  });
}
