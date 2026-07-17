import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { EmployeeForm } from "../_employee-form";
import { PayslipsManager, type SlipView } from "./_payslips";
import { SalaryManager, type ComponentView } from "./_salary";
import { DeleteEmployeeButton } from "./_delete-employee";
import { updateEmployee } from "../../_actions";

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkError?: string }>;
}) {
  const { id } = await params;
  const { linkError } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [emp, supervisors] = await Promise.all([
      db.payrollEmployee.findFirst({
        where: { id },
        include: {
          payslips: { orderBy: [{ year: "desc" }, { month: "desc" }] },
          salaryComponents: { orderBy: { sortOrder: "asc" } },
        },
      }),
      db.payrollEmployee.findMany({
        where: { id: { not: id } },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
      }),
    ]);
    if (!emp) notFound();

    const components: ComponentView[] = emp.salaryComponents.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.label,
      currency: c.currency,
      amount: Number(c.amountCents),
      perDay: c.perDay,
      taxable: c.taxable,
    }));

    const slips: SlipView[] = emp.payslips.map((s) => ({
      id: s.id,
      year: s.year,
      month: s.month,
      netLbp: Number(s.netLbpCents),
      netUsd: Number(s.netUsdCents),
      paid: s.paid,
      salaryDate: s.salaryDate ? s.salaryDate.toISOString().slice(0, 10) : null,
      imported: s.darsSalaryId != null,
    }));
    const currentYear = new Date().getUTCFullYear();

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader
          title={emp.displayName}
          description={emp.employmentType ?? "Personnel"}
          action={
            <Link href="/payroll" className="text-sm text-[color:var(--color-brand-600)] hover:underline">
              ← Personnel
            </Link>
          }
        />

        {linkError ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)] px-4 py-3 text-sm text-[color:var(--color-warning-soft-fg)]"
          >
            {linkError}
          </div>
        ) : null}

        <Card>
          <CardBody className="space-y-4">
            <EmployeeForm
              action={updateEmployee.bind(null, id)}
              submitLabel="Enregistrer"
              supervisors={supervisors}
              initial={{
                displayName: emp.displayName,
                jobTitle: emp.jobTitle,
                department: emp.department,
                employmentType: emp.employmentType,
                active: emp.active,
                recruitedAt: emp.recruitedAt ? emp.recruitedAt.toISOString().slice(0, 10) : null,
                email: emp.email,
                supervisorId: emp.supervisorId,
                taxCategory: emp.taxCategory,
                defaultDaysPerMonth: emp.defaultDaysPerMonth,
                kmDistance: emp.kmDistance,
              }}
            />
            <div className="flex justify-end border-t border-[color:var(--color-border-subtle)] pt-4">
              <DeleteEmployeeButton id={id} name={emp.displayName} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SalaryManager employeeId={id} components={components} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <PayslipsManager employeeId={id} payslips={slips} currentYear={currentYear} />
          </CardBody>
        </Card>
      </main>
    );
  });
}
