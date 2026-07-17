import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { EmployeeForm } from "../_employee-form";
import { createEmployee } from "../../_actions";

export default async function NewEmployeePage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  return runWithTenant({ tenantId, slug: null }, async () => {
    const supervisors = await db.payrollEmployee.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    });
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <PageHeader title="Nouvel employé" description="Ajouter un membre du personnel" />
        <Card>
          <CardBody>
            <EmployeeForm action={createEmployee} submitLabel="Créer" supervisors={supervisors} />
          </CardBody>
        </Card>
      </main>
    );
  });
}
