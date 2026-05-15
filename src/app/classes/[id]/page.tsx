import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { enrollStudent, unenrollStudent } from "../_actions";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withTenantSession(async (user) => {
    const t = await getTranslations("classes");
    const tStudents = await getTranslations("students");
    const tCommon = await getTranslations("common");

    const klass = await db.class.findUnique({
      where: { id },
      include: {
        academicYear: { select: { label: true, id: true } },
        enrollments: {
          include: {
            student: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { enrolledAt: "asc" },
        },
      },
    });

    if (!klass) notFound();

    const candidates = await db.student.findMany({
      where: {
        status: { in: ["ENROLLED", "PROSPECT"] },
        NOT: { enrollments: { some: { academicYearId: klass.academicYear.id } } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    });

    const boundEnroll = enrollStudent.bind(null, id);
    const isAdmin = user.role === "SCHOOL_ADMIN";

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={klass.name}
            description={`${klass.level} · ${klass.section} · ${klass.academicYear.label}`}
            action={
              <Link
                href="/classes"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {tCommon("back")}
              </Link>
            }
          />

          <Card>
            <CardHeader title={tStudents("title")} />
            <Table>
              <THead>
                <tr>
                  <TH>{tStudents("colName")}</TH>
                  <TH className="text-right">{tStudents("colActions")}</TH>
                </tr>
              </THead>
              <tbody>
                {klass.enrollments.length === 0 ? (
                  <EmptyRow colSpan={2}>{t("enrollEmpty")}</EmptyRow>
                ) : (
                  klass.enrollments.map((e) => {
                    const boundUnenroll = unenrollStudent.bind(null, id, e.student.id);
                    return (
                      <TR key={e.id}>
                        <TD>
                          <Link
                            href={`/students/${e.student.id}`}
                            className="font-medium hover:underline"
                          >
                            {e.student.lastName} {e.student.firstName}
                          </Link>
                        </TD>
                        <TD className="text-right">
                          {isAdmin ? (
                            <form action={boundUnenroll}>
                              <Button variant="ghost" size="sm" type="submit">
                                {tCommon("delete")}
                              </Button>
                            </form>
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </tbody>
            </Table>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader title={t("enrollTitle")} />
              <CardBody>
                {candidates.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted-fg)]">{t("enrollEmpty")}</p>
                ) : (
                  <form action={boundEnroll} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select name="studentId" defaultValue="">
                        <option value="" disabled>
                          —
                        </option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.lastName} {c.firstName}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button type="submit">{tCommon("create")}</Button>
                  </form>
                )}
              </CardBody>
            </Card>
          ) : null}
        </main>
      </div>
    );
  });
}
