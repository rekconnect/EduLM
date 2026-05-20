import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { isStorageConfigured } from "@/lib/storage";
import { DocumentForm } from "./_form";

export default async function NewDocumentPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("documents");

    const [classes, years] = await Promise.all([
      db.class.findMany({
        orderBy: [{ level: "asc" }, { section: "asc" }],
        select: { id: true, name: true },
      }),
      db.academicYear.findMany({
        orderBy: { startDate: "desc" },
        select: { id: true, label: true, isActive: true },
      }),
    ]);

    return (
        <main className="mx-auto max-w-2xl px-6 py-10">
          <PageHeader title={t("newTitle")} />
          <Card>
            <CardBody>
              <DocumentForm
                classes={classes}
                years={years}
                storageEnabled={isStorageConfigured()}
              />
            </CardBody>
          </Card>
        </main>
    );
  });
}
