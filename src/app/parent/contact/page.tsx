import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { withParentSession } from "@/lib/session";
import { ContactForm } from "./_form";

export default async function ParentContactPage() {
  return withParentSession(async (user) => {
    const t = await getTranslations("communication");

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-2xl px-6 py-10">
          <PageHeader title={t("contactTitle")} description={t("contactLead")} />
          <Card>
            <CardBody>
              <ContactForm />
            </CardBody>
          </Card>
        </main>
      </AppShell>
    );
  });
}
