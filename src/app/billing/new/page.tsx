import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { InvoiceForm } from "./_form";

function defaultInvoiceNumber(): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${yy}${mm}-${rnd}`;
}

export default async function NewInvoicePage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  const t = await getTranslations("billing");

  return runWithTenant({ tenantId, slug: null }, async () => {
    const students = await db.student.findMany({
      where: { status: { in: ["ENROLLED", "PROSPECT"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    });

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <PageHeader title={t("newTitle")} />
          <Card>
            <CardBody>
              <InvoiceForm
                students={students}
                defaultNumber={defaultInvoiceNumber()}
                defaultCurrency="USD"
              />
            </CardBody>
          </Card>
        </main>
      </div>
    );
  });
}
