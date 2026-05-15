import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { createDisciplineEvent } from "../_actions";
import { DisciplineForm } from "../_form";

export default async function NewDisciplinePage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { studentId } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("discipline");
    const tCommon = await getTranslations("common");

    const students = await db.student.findMany({
      where: { status: { in: ["ENROLLED", "PROSPECT"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    });

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <PageHeader title={t("newTitle")} />
          <Card>
            <CardBody>
              <DisciplineForm
                action={createDisciplineEvent}
                students={students}
                defaultStudentId={studentId}
                submitLabel={tCommon("create")}
              />
            </CardBody>
          </Card>
        </main>
      </div>
    );
  });
}
