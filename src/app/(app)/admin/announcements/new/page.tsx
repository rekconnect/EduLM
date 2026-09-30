import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { loadPickerOptions } from "@/lib/messaging";
import { AnnouncementForm } from "./_form";

export default async function NewAnnouncementPage() {
  const { user, access } = await requireModuleAccess("communication", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");
    const tA = await getTranslations("messaging.annonces");

    // Establishments, levels and classes of the ACTIVE academic year — the
    // same option set the messagerie composer uses.
    const { establishments, levels, classes } = await loadPickerOptions();

    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <PageHeader title={t("newAnnouncementTitle")} description={tA("newLead")} />
        <Card>
          <CardBody>
            <AnnouncementForm
              establishments={establishments}
              levels={levels}
              classes={classes}
              allowAll={hasModule(access, "communication", "full")}
            />
          </CardBody>
        </Card>
      </main>
    );
  });
}
