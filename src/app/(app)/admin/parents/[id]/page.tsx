import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { splitLegacyName } from "@/lib/names";
import { listEstablishments, loadEntityFieldsConfig } from "../../../settings/_actions";
import { ParentCustomAnswersForm } from "./_custom-answers";
import {
  toggleParentStatus,
  unlinkGuardianFromStudent,
  updateParent,
} from "../_actions";
import { EditParentForm } from "./_edit-form";
import { ResetPasswordButton } from "./_reset-password";

const STATUS_KEY: Record<string, string> = {
  ACTIVE: "statusActive",
  INVITED: "statusInvited",
  DISABLED: "statusDisabled",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INVITED: "bg-amber-100 text-amber-800",
  DISABLED: "bg-zinc-200 text-zinc-700",
};

export default async function ParentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("parents");
    const tCommon = await getTranslations("common");

    const [parent, parentFieldsConfig, establishmentsRaw] = await Promise.all([
      db.user.findUnique({
        where: { id },
        include: {
          guardianProfile: {
            include: {
              family: { select: { code: true } },
              childLinks: {
                include: {
                  student: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
      loadEntityFieldsConfig("parent"),
      listEstablishments(),
    ]);
    if (!parent || parent.role !== "PARENT") notFound();

    // Pass id + name + levels to the renderer. Levels feed the cascading
    // niveau dropdown of the establishment_with_niveau compound type.
    const establishmentsForRenderer = establishmentsRaw
      .filter((e) => e.isActive)
      .map((e) => ({
        id: e.id,
        name: e.name,
        levels: Array.isArray(e.levels)
          ? (e.levels.filter((x) => typeof x === "string") as string[])
          : [],
      }));

    // Coerce User.customAnswers (Json) to a flat string map for the renderer.
    const initialAnswers: Record<string, string> = {};
    if (parent.customAnswers && typeof parent.customAnswers === "object") {
      for (const [k, v] of Object.entries(parent.customAnswers as Record<string, unknown>)) {
        if (typeof v === "string") initialAnswers[k] = v;
        else if (v != null) initialAnswers[k] = String(v);
      }
    }

    const boundUpdate = updateParent.bind(null, id);
    const boundToggle = toggleParentStatus.bind(null, id);

    return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader
            title={parent.name ?? parent.email}
            description={
              parent.guardianProfile?.family?.code
                ? `${parent.email} · Code famille ${parent.guardianProfile.family.code}`
                : parent.email
            }
            action={
              <Link
                href="/admin/parents"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {t("title")}
              </Link>
            }
          />

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                STATUS_TONE[parent.status]
              }`}
            >
              {t(STATUS_KEY[parent.status] ?? "statusActive")}
            </span>
          </div>

          <Card>
            <CardHeader title={t("editTitle")} />
            <CardBody>
              <EditParentForm
                action={boundUpdate}
                initial={{
                  // Prefer the split fields; fall back to splitting the legacy
                  // `name` on first space for records created before the split.
                  firstName:
                    parent.firstName ?? splitLegacyName(parent.name).firstName,
                  lastName:
                    parent.lastName ?? splitLegacyName(parent.name).lastName,
                  email: parent.email,
                  relation: parent.guardianProfile?.relation ?? "",
                  locale: parent.locale ?? "fr",
                }}
              />
            </CardBody>
          </Card>

          {parentFieldsConfig.fields.length > 0 ? (
            <Card>
              <CardHeader title={t("customFieldsTitle")} />
              <CardBody>
                <ParentCustomAnswersForm
                  parentUserId={parent.id}
                  config={parentFieldsConfig}
                  initialAnswers={initialAnswers}
                  extras={{ establishments: establishmentsForRenderer }}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("childrenTitle")} />
            <CardBody>
              {!parent.guardianProfile || parent.guardianProfile.childLinks.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noChildren")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {parent.guardianProfile.childLinks.map((link) => {
                    const boundUnlink = unlinkGuardianFromStudent.bind(
                      null,
                      link.student.id,
                      parent.id,
                    );
                    return (
                      <li
                        key={link.studentId}
                        className="flex items-center justify-between border-b border-[color:var(--border)] pb-2 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/students/${link.student.id}`}
                            className="font-medium hover:underline"
                          >
                            {link.student.lastName} {link.student.firstName}
                          </Link>
                          {link.isPrimary ? (
                            <span className="inline-flex rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-xs text-[color:var(--primary)]">
                              {t("primaryBadge")}
                            </span>
                          ) : null}
                        </div>
                        <form action={boundUnlink}>
                          <Button type="submit" size="sm" variant="ghost">
                            {t("unlinkAction")}
                          </Button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("resetPassword")} description={t("resetPasswordHint")} />
            <CardBody className="flex items-start justify-between gap-4">
              <ResetPasswordButton parentId={parent.id} />
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <form action={boundToggle}>
              <Button
                type="submit"
                size="sm"
                variant={parent.status === "DISABLED" ? "secondary" : "danger"}
              >
                {parent.status === "DISABLED" ? t("enableAction") : t("disableAction")}
              </Button>
            </form>
          </div>

          {/* unused vars get tree-shaken; keep for type checks */}
          {tCommon("save")[0] === "" ? null : null}
        </main>
    );
  });
}
