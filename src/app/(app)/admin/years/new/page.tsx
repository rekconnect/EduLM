import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { YearForm } from "./_form";

export default async function NewYearPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const t = await getTranslations("admissions");

  return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("yearsNewCta")} />
        <Card>
          <CardBody>
            <YearForm />
          </CardBody>
        </Card>
      </main>
  );
}
