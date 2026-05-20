import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { CycleForm } from "./_form";

export default async function NewCyclePage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  const t = await getTranslations("admissions");

  const cycles = tenantId
    ? await runWithTenant({ tenantId, slug: null }, async () =>
        db.admissionCycle.findMany({
          orderBy: { openAt: "desc" },
          select: { id: true, label: true, targetYearLabel: true },
        }),
      )
    : [];

  return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <PageHeader title={t("cyclesNewCta")} />
        <Card>
          <CardBody>
            <CycleForm
              copyableCycles={cycles.map((c) => ({
                id: c.id,
                label: `${c.label} · ${c.targetYearLabel}`,
              }))}
            />
          </CardBody>
        </Card>
      </main>
  );
}
