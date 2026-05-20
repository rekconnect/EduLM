import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { createClass } from "../_actions";
import { ClassForm } from "../_form";

export default async function NewClassPage({
  searchParams,
}: {
  searchParams: Promise<{ yearId?: string }>;
}) {
  const { yearId: preselectedYearId } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("classes");
    const tCommon = await getTranslations("common");

    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });

    if (years.length === 0) {
      return (
          <main className="mx-auto max-w-2xl px-6 py-10">
            <PageHeader title={t("newTitle")} />
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noActiveYear")}</p>
                <p className="mt-2 text-sm">
                  <a href="/admin/years/new" className="text-[color:var(--primary)] hover:underline">
                    + Créer une année scolaire
                  </a>
                </p>
              </CardBody>
            </Card>
          </main>
      );
    }

    const defaultYearId =
      preselectedYearId && years.find((y) => y.id === preselectedYearId)
        ? preselectedYearId
        : (years.find((y) => y.isActive)?.id ?? years[0]!.id);

    return (
        <main className="mx-auto max-w-2xl px-6 py-10">
          <PageHeader title={t("newTitle")} />
          <Card>
            <CardBody>
              <ClassForm
                action={createClass}
                submitLabel={tCommon("create")}
                years={years}
                defaultYearId={defaultYearId}
              />
            </CardBody>
          </Card>
        </main>
    );
  });
}
