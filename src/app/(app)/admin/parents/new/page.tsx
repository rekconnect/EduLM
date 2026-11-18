import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import {
  loadEntityFieldsConfig,
  loadParentCreateConfig,
} from "@/app/(app)/settings/_actions";
import { DEFAULT_PARENT_CREATE_CONFIG } from "@/lib/parent-create-config";
import { CreateParentForm } from "./_form";

export default async function NewParentPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { user } = await requireModuleAccess("eleves", "write");
  const { studentId } = await searchParams;
  // Reached from a child's page: the new parent will be linked to that child
  // and recorded under its family code. Tenant-scoped lookup, so an id from
  // another school shows nothing and links nothing.
  const linkStudent =
    studentId && user.tenantId
      ? await runWithTenant({ tenantId: user.tenantId, slug: null }, () =>
          db.student.findUnique({
            where: { id: studentId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              family: { select: { code: true } },
            },
          }),
        )
      : null;
  // Load both configs in parallel:
  //  - parentCreateConfig — drives the form structure (which built-in
  //    fields show, which extras to add)
  //  - parentFieldsConfig — used here only to resolve labels for the
  //    built-in firstName/lastName/email fields (userBoundTo) so the
  //    "Add a parent" form matches the labels admin sees everywhere
  //    else (parent profile preview, edit form, dossier, etc.).
  const [t, createConfig, parentFieldsConfig] = await Promise.all([
    getTranslations("parents"),
    loadParentCreateConfig().catch(() => DEFAULT_PARENT_CREATE_CONFIG),
    loadEntityFieldsConfig("parent"),
  ]);

  // Resolve labels for the three User-bound props. Whichever custom
  // field has `userBoundTo: X` (and is active) provides X's label.
  function labelForBoundProp(
    prop: "firstName" | "lastName" | "email",
  ): string | undefined {
    const f = parentFieldsConfig.fields.find(
      (x) => x.userBoundTo === prop && x.active !== false,
    );
    return f?.label;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader title={t("newTitle")} />
      <Card>
        <CardBody>
          <CreateParentForm
            linkStudent={
              linkStudent
                ? {
                    id: linkStudent.id,
                    note: linkStudent.family?.code
                      ? t("createLinkedNote", {
                          child: `${linkStudent.lastName} ${linkStudent.firstName}`,
                          code: linkStudent.family.code,
                        })
                      : t("createLinkedNoteNoCode", {
                          child: `${linkStudent.lastName} ${linkStudent.firstName}`,
                        }),
                  }
                : undefined
            }
            config={createConfig}
            labels={{
              firstName: labelForBoundProp("firstName"),
              lastName: labelForBoundProp("lastName"),
              email: labelForBoundProp("email"),
            }}
          />
        </CardBody>
      </Card>
    </main>
  );
}
