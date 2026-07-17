import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { PayslipDocument, type PayslipData } from "@/components/payslip/payslip-document";
import { PrintButton } from "@/components/payslip/print-button";
import type { PayslipBreakdown } from "@/lib/payroll-run";

export default async function AdminPayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("payslip");
    const slip = await db.payslip.findFirst({
      where: { id },
      include: { employee: { select: { id: true, displayName: true, taxCategory: true } } },
    });
    if (!slip) notFound();

    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    });

    const data: PayslipData = {
      employeeName: slip.employee.displayName,
      category: slip.employee.taxCategory,
      year: slip.year,
      month: slip.month,
      netUsdCents: Number(slip.netUsdCents),
      netLbpCents: Number(slip.netLbpCents),
      paid: slip.paid,
      breakdown: (slip.breakdown as unknown as PayslipBreakdown | null) ?? null,
      isDars: slip.darsSalaryId != null,
    };

    return (
      <main className="mx-auto max-w-2xl space-y-4 px-6 py-10">
        <div className="no-print flex items-center justify-between">
          <Link href={`/payroll/employees/${slip.employee.id}`} className="text-sm text-[color:var(--color-brand-600)] hover:underline">
            ← {slip.employee.displayName}
          </Link>
          <PrintButton />
        </div>
        <PayslipDocument data={data} tenantName={tenant?.name ?? "EduLM"} logoUrl={tenant?.logoUrl ?? null} />
      </main>
    );
  });
}
