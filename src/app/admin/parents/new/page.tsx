import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { CreateParentForm } from "./_form";

export default async function NewParentPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const t = await getTranslations("parents");

  return (
    <AppShell role={user.role} userLabel={user.name ?? user.email}>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("newTitle")} />
        <Card>
          <CardBody>
            <CreateParentForm />
          </CardBody>
        </Card>
      </main>
    </AppShell>
  );
}
