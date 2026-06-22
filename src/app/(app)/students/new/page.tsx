import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { loadStudentCreateConfig } from "../../settings/_actions";
import { createStudent } from "../_actions";
import { StudentForm } from "../_form";

export default async function NewStudentPage() {
  await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const t = await getTranslations("students");
  const tCommon = await getTranslations("common");
  const config = await loadStudentCreateConfig();

  return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("newTitle")} />
        <Card>
          <CardBody>
            <StudentForm
              action={createStudent}
              submitLabel={tCommon("create")}
              config={config}
            />
          </CardBody>
        </Card>
      </main>
  );
}
