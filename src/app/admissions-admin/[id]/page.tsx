import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
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

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
  DECLINED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-zinc-200 text-zinc-700",
};

const GENDER_KEY: Record<string, string> = {
  MALE: "genderMale",
  FEMALE: "genderFemale",
  OTHER: "genderOther",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[color:var(--border)] py-2 last:border-0">
      <dt className="text-sm text-[color:var(--muted-fg)]">{label}</dt>
      <dd className="col-span-2 text-sm">{value || "—"}</dd>
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
                    student: { select: { id: true, firstName: true, lastName: true } },
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

    const classes = await db.class.findMany({
      where: { academicYear: { isActive: true } },
      orderBy: [{ level: "asc" }, { section: "asc" }],
      select: { id: true, name: true, level: true, section: true },
    });

    const finalized = ["ACCEPTED", "DECLINED", "WAITLISTED"].includes(app.status);

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${app.childLastName} ${app.childFirstName}`}
            description={`${app.cycle.label} · ${app.cycle.targetYearLabel}`}
            action={
              <Link
                href="/admissions-admin"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {t("adminTitle")}
              </Link>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                STATUS_TONE[app.status]
              }`}
            >
              {t(STATUS_KEY[app.status] ?? "statusSubmitted")}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                isExistingFamily
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100"
              }`}
            >
              {isExistingFamily ? t("badgeExistingFamily") : t("badgeNewFamily")}
            </span>
            {app.existingStudentId ? (
              <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">
                {t("renewalBadge")}
              </span>
            ) : null}
            <span className="text-xs text-[color:var(--muted-fg)]">
              {app.submittedAt ? `${t("colSubmitted")}: ${app.submittedAt.toISOString().slice(0, 10)}` : "—"}
              {app.reviewedBy ? ` · ${app.reviewedBy.name ?? app.reviewedBy.email}` : ""}
            </span>
          </div>

          {isExistingFamily ? (
            <Card>
              <CardHeader title={t("groupExistingFamily")} description={t("existingChildrenCount", { n: existingChildren.length })} />
              <CardBody>
                <ul className="space-y-1 text-sm">
                  {existingChildren.map((link) => (
                    <li key={link.student.id} className="flex items-center justify-between">
                      <span className="font-medium">
                        {link.student.lastName} {link.student.firstName}
                      </span>
                      <Link
                        href={`/students/${link.student.id}`}
                        className="text-xs text-[color:var(--primary)] hover:underline"
                      >
                        Voir l&apos;élève →
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {!finalized ? (
            <Card>
              <CardHeader title={t("adminReview")} />
              <CardBody>
                <DecideForm applicationId={app.id} classes={classes} />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">
                  {t(STATUS_KEY[app.status] ?? "statusSubmitted")}
                  {app.decisionNote ? ` — ${app.decisionNote}` : ""}
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
                  value={app.childGender ? t(GENDER_KEY[app.childGender] ?? "genderOther") : ""}
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
      </div>
    );
  });
}
