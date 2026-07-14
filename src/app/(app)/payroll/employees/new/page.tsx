import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { EmployeeForm } from "../_employee-form";
import { createEmployee } from "../../_actions";

export default async function NewEmployeePage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <PageHeader title="Nouvel employé" description="Ajouter un membre du personnel" />
      <Card>
        <CardBody>
          <EmployeeForm action={createEmployee} submitLabel="Créer" />
        </CardBody>
      </Card>
    </main>
  );
}
