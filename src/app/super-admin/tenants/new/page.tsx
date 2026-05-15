import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { createTenant } from "../_actions";
import { TenantForm } from "../_form";

export default async function NewTenantPage() {
  const user = await requireRole("SUPER_ADMIN");
  const t = await getTranslations("tenants");
  const tCommon = await getTranslations("common");

  return (
    <div className="min-h-screen">
      <AppHeader role={user.role} userLabel={user.email} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <PageHeader title={t("newTitle")} />
        <Card>
          <CardBody>
            <TenantForm action={createTenant} submitLabel={tCommon("create")} />
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
