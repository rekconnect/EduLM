import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { createClass } from "../_actions";
import { ClassForm } from "../_form";

export default async function NewClassPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const t = await getTranslations("classes");
  const tCommon = await getTranslations("common");

  return (
    <div className="min-h-screen">
      <AppHeader role={user.role} userLabel={user.name ?? user.email} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("newTitle")} />
        <Card>
          <CardBody>
            <ClassForm action={createClass} submitLabel={tCommon("create")} />
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
