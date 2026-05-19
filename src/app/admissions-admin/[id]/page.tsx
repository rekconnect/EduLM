import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Clock, RefreshCw, Sparkles, Users, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { AppStatusBadge } from "@/app/parent/applications/_status-badge";
import { DecideForm } from "./_decide";

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

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)] px-3 py-2.5 text-sm text-[color:var(--color-warning-soft-fg)]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export default async function AdmissionsAdminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const app = await db.application.findUnique({
      where: { id },
      include: {
        cycle: { select: { label: true, targetYearLabel: true } },
        submittedBy: {
          select: {
            email: true,
            name: true,
            guardianProfile: {
              select: {
                childLinks: {
                  select: {
                    student: {
                      select: { id: true, firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
          },
        },
        reviewedBy: { select: { email: true, name: true } },
      },
    });
    if (!app) notFound();

    const existingChildren = app.submittedBy.guardianProfile?.childLinks ?? [];
    const isExistingFamily = existingChildren.length > 0;

    const targetYear = await db.academicYear.findUnique({
      where: { tenantId_label: { tenantId, label: app.cycle.targetYearLabel } },
      select: { id: true, label: true },
    });

    const classes = targetYear
      ? await db.class.findMany({
          where: { academicYearId: targetYear.id },
          orderBy: [{ level: "asc" }, { section: "asc" }],
          select: { id: true, name: true, level: true, section: true },
        })
      : [];

    const finalized = ["ACCEPTED", "DECLINED", "WAITLISTED"].includes(app.status);

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${app.childLastName} ${app.childFirstName}`}
            description={`${app.cycle.label} · ${app.cycle.targetYearLabel}`}
            action={
              <Link
                href="/admissions-admin"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {t("adminTitle")}
              </Link>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <AppStatusBadge
              status={app.status}
              size="md"
              label={t(STATUS_KEY[app.status] ?? "statusSubmitted")}
            />
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                isExistingFamily
                  ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                  : "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
              )}
            >
              {isExistingFamily ? (
                <>
                  <Users className="size-3" aria-hidden />
                  {t("badgeExistingFamily")}
                </>
              ) : (
                <>
                  <Sparkles className="size-3" aria-hidden />
                  {t("badgeNewFamily")}
                </>
              )}
            </span>
            {app.existingStudentId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-brand-100)] px-3 py-1 text-xs font-medium uppercase tracking-wider text-[color:var(--color-brand-700)]">
                <RefreshCw className="size-3" aria-hidden />
                {t("renewalBadge")}
              </span>
            ) : null}
            <span className="ms-auto inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-muted)]">
              {app.submittedAt ? (
                <>
                  <Clock className="size-3" aria-hidden />
                  {t("colSubmitted")}: {app.submittedAt.toISOString().slice(0, 10)}
                </>
              ) : (
                "—"
              )}
              {app.reviewedBy
                ? ` · ${app.reviewedBy.name ?? app.reviewedBy.email}`
                : ""}
            </span>
          </div>

          {isExistingFamily ? (
            <Card>
              <CardHeader
                title={t("groupExistingFamily")}
                description={t("existingChildrenCount", {
                  n: existingChildren.length,
                })}
              />
              <CardBody>
                <ul className="space-y-1.5 text-sm">
                  {existingChildren.map((link) => (
                    <li
                      key={link.student.id}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-[color:var(--color-surface-hover)]"
                    >
                      <span className="font-medium text-[color:var(--color-foreground)]">
                        {link.student.lastName} {link.student.firstName}
                      </span>
                      <Link
                        href={`/students/${link.student.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)] hover:underline"
                      >
                        Voir l&apos;élève
                        <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {!finalized ? (
            <Card>
              <CardHeader
                title={t("adminReview")}
                description={`Cible : ${app.cycle.targetYearLabel}`}
              />
              <CardBody className="space-y-3">
                {!targetYear ? (
                  <WarningBanner>
                    L&apos;année scolaire{" "}
                    <strong>{app.cycle.targetYearLabel}</strong> n&apos;existe pas
                    encore. Créez-la dans{" "}
                    <Link
                      href="/admin/years/new"
                      className="underline underline-offset-2"
                    >
                      Configuration → Années
                    </Link>{" "}
                    avant d&apos;accepter ce dossier.
                  </WarningBanner>
                ) : classes.length === 0 ? (
                  <WarningBanner>
                    Aucune classe pour <strong>{targetYear.label}</strong>. Créez
                    les classes dans{" "}
                    <Link
                      href={`/classes/new?yearId=${targetYear.id}`}
                      className="underline underline-offset-2"
                    >
                      Classes → Nouvelle classe
                    </Link>{" "}
                    pour pouvoir affecter cet élève.
                  </WarningBanner>
                ) : null}
                <DecideForm applicationId={app.id} classes={classes} />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--color-foreground)]">
                  <span className="font-semibold">
                    {t(STATUS_KEY[app.status] ?? "statusSubmitted")}
                  </span>
                  {app.decisionNote ? (
                    <>
                      <span className="text-[color:var(--color-foreground-muted)]">
                        {" "}
                        —{" "}
                      </span>
                      {app.decisionNote}
                    </>
                  ) : null}
                </p>
              </CardBody>
            </Card>
          )}

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
                <Row label={t("fieldSecondaryParentName")} value={app.secondaryParentName ?? ""} />
                <Row label={t("fieldSecondaryParentPhone")} value={app.secondaryParentPhone ?? ""} />
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
