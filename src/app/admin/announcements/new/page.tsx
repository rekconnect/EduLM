import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { AnnouncementForm } from "./_form";

export default async function NewAnnouncementPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");

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
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <PageHeader title={t("newAnnouncementTitle")} />
          <Card>
            <CardBody>
              <AnnouncementForm classes={classes} years={years} />
            </CardBody>
          </Card>
        </main>
      </div>
    );
  });
}
