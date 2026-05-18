import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { createStudent } from "../_actions";
import { StudentForm } from "../_form";

export default async function NewStudentPage() {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const t = await getTranslations("students");
  const tCommon = await getTranslations("common");

  return (
    <AppShell role={user.role} userLabel={user.name ?? user.email} >
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("newTitle")} />
        <Card>
          <CardBody>
            <StudentForm action={createStudent} submitLabel={tCommon("create")} />
          </CardBody>
        </Card>
      </main>
    </AppShell>
  );
}
