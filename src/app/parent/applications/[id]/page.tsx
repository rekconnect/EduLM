import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Clock, Pencil } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { AppStatusBadge } from "../_status-badge";

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  SUBMITTED: "statusSubmitted",
  UNDER_REVIEW: "statusUnderReview",
  INTERVIEW_SCHEDULED: "statusInterview",
  ACCEPTED: "statusAccepted",
  WAITLISTED: "statusWaitlisted",
  DECLINED: "statusDeclined",
  WITHDRAWN: "statusWithdrawn",
};

const GENDER_KEY: Record<string, string> = {
  MALE: "genderMale",
  FEMALE: "genderFemale",
  OTHER: "genderOther",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[color:var(--color-border-subtle)] py-2.5 last:border-0">
      <dt className="text-sm text-[color:var(--color-foreground-muted)]">{label}</dt>
      <dd className="col-span-2 text-sm text-[color:var(--color-foreground)]">
        {value || "—"}
      </dd>
    </div>
  );
}

export default async function ParentApplicationViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const app = await db.application.findUnique({
      where: { id },
      include: { cycle: { select: { label: true, targetYearLabel: true } } },
    });
    if (!app) notFound();
    if (app.submittedByUserId !== user.id) notFound();
    if (app.status === "DRAFT") redirect(`/parent/applications/${id}/edit`);

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${app.childFirstName} ${app.childLastName}`}
            description={`${app.cycle.label} · ${app.cycle.targetYearLabel}`}
            action={
              <Link
                href="/parent/applications"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {t("myApplicationsTitle")}
              </Link>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <AppStatusBadge
              status={app.status}
              size="md"
              label={t(STATUS_KEY[app.status] ?? "statusSubmitted")}
            />
            {app.submittedAt ? (
              <span className="inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-muted)]">
                <Clock className="size-3" aria-hidden />
                {app.submittedAt.toISOString().slice(0, 10)}
              </span>
            ) : null}
            {app.status === "SUBMITTED" ? (
              <Link
                href={`/parent/applications/${id}/edit`}
                className="ms-auto inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
              >
                <Pencil className="size-3.5" aria-hidden />
                {t("editFromView")}
              </Link>
            ) : null}
          </div>

          {app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" ? (
            <Card>
              <CardBody>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("submittedTitle")}
                </h2>
                <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("submittedLead")}
                </p>
              </CardBody>
            </Card>
          ) : null}

          {app.decisionNote ? (
            <Card>
              <CardHeader title={t("adminDecisionNote")} />
              <CardBody>
                <p className="whitespace-pre-line text-sm text-[color:var(--color-foreground)]">
                  {app.decisionNote}
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("stepIdentity")} />
            <CardBody>
              <dl>
                <Row label={t("fieldChildFirstName")} value={app.childFirstName} />
                <Row label={t("fieldChildLastName")} value={app.childLastName} />
                <Row
                  label={t("fieldChildDob")}
                  value={app.childDob ? app.childDob.toISOString().slice(0, 10) : ""}
                />
                <Row
                  label={t("fieldChildGender")}
                  value={
                    app.childGender ? t(GENDER_KEY[app.childGender] ?? "genderOther") : ""
                  }
                />
                <Row label={t("fieldChildNationality")} value={app.childNationality ?? ""} />
                <Row label={t("fieldChildPlaceOfBirth")} value={app.childPlaceOfBirth ?? ""} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("stepFamily")} />
            <CardBody>
              <dl>
                <Row label={t("fieldPrimaryParentName")} value={app.primaryParentName} />
                <Row label={t("fieldPrimaryParentPhone")} value={app.primaryParentPhone ?? ""} />
                <Row label={t("fieldPrimaryParentEmail")} value={app.primaryParentEmail ?? ""} />
                <Row
                  label={t("fieldSecondaryParentName")}
                  value={app.secondaryParentName ?? ""}
                />
                <Row
                  label={t("fieldSecondaryParentPhone")}
                  value={app.secondaryParentPhone ?? ""}
                />
                <Row label={t("fieldAddress")} value={app.address ?? ""} />
                <Row label={t("fieldCity")} value={app.city ?? ""} />
                <Row label={t("fieldPostalCode")} value={app.postalCode ?? ""} />
                <Row label={t("fieldCountry")} value={app.country ?? ""} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("stepAcademic")} />
            <CardBody>
              <dl>
                <Row label={t("fieldCurrentSchool")} value={app.currentSchool ?? ""} />
                <Row label={t("fieldCurrentLevel")} value={app.currentLevel ?? ""} />
                <Row label={t("fieldRequestedLevel")} value={app.requestedLevel ?? ""} />
                <Row label={t("fieldMotivation")} value={app.motivationNote ?? ""} />
              </dl>
            </CardBody>
          </Card>
        </main>
      </AppShell>
    );
  });
}
