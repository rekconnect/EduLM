import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { CycleForm } from "./_form";

export default async function NewCyclePage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const t = await getTranslations("admissions");

  return (
    <div className="min-h-screen">
      <AppHeader role={user.role} userLabel={user.name ?? user.email} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("cyclesNewCta")} />
        <Card>
          <CardBody>
            <CycleForm />
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
