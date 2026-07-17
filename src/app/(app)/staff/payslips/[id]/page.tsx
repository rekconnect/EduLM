import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, unscopedDb } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { PayslipDocument, type PayslipData } from "@/components/payslip/payslip-document";
import { PrintButton } from "@/components/payslip/print-button";
import type { PayslipBreakdown } from "@/lib/payroll-run";

export default async function StaffPayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withStaffSession(async (user, employee) => {
    const t = await getTranslations("payslip");
    if (!employee) notFound();

    // Own payslip only, and only if visible (published or Dars history).
    const slip = await db.payslip.findFirst({
      where: {
        id,
        employeeId: employee.id,
        OR: [{ darsSalaryId: { not: null } }, { publishedAt: { not: null } }],
      },
    });
    if (!slip) notFound();

    const tenant = user.tenantId
      ? await unscopedDb().tenant.findUnique({ where: { id: user.tenantId }, select: { name: true, logoUrl: true } })
      : null;

    const data: PayslipData = {
      employeeName: employee.displayName,
      category: employee.taxCategory,
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
          <Link href="/staff/payslips" className="text-sm text-[color:var(--color-brand-600)] hover:underline">
            ← {t("backMine")}
          </Link>
          <PrintButton />
        </div>
        <PayslipDocument data={data} tenantName={tenant?.name ?? "EduLM"} logoUrl={tenant?.logoUrl ?? null} />
      </main>
    );
  });
}
