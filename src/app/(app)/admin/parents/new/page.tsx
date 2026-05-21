import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { loadParentCreateConfig } from "@/app/(app)/settings/_actions";
import { DEFAULT_PARENT_CREATE_CONFIG } from "@/lib/parent-create-config";
import { CreateParentForm } from "./_form";

export default async function NewParentPage() {
  await requireRole("SCHOOL_ADMIN");
  const [t, config] = await Promise.all([
    getTranslations("parents"),
    loadParentCreateConfig().catch(() => DEFAULT_PARENT_CREATE_CONFIG),
  ]);

  return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("newTitle")} />
        <Card>
          <CardBody>
            <CreateParentForm config={config} />
          </CardBody>
        </Card>
      </main>
  );
}
