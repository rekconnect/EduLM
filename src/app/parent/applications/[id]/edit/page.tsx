import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { submitApplication } from "../../_actions";
import { IdentityStepForm, FamilyStepForm, AcademicStepForm } from "./_step-forms";

const TOTAL_STEPS = 4;

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

// Canonical French school-level ordering for the level dropdown.
const LEVEL_ORDER = [
  "PS", "MS", "GS",
  "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème",
  "Seconde", "Première", "Terminale",
];

function sortLevels(levels: string[]): string[] {
  return [...new Set(levels)].sort((a, b) => {
    const ai = LEVEL_ORDER.indexOf(a);
    const bi = LEVEL_ORDER.indexOf(b);
    // Unknown levels go to the bottom, alphabetical among themselves.
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default async function EditApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step: rawStep } = await searchParams;
  const step = Math.min(Math.max(parseInt(rawStep ?? "1", 10) || 1, 1), TOTAL_STEPS);

  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");
    const tCommon = await getTranslations("common");

    const app = await db.application.findUnique({
      where: { id },
      include: { cycle: { select: { label: true, targetYearLabel: true } } },
    });
    if (!app) notFound();
    if (app.submittedByUserId !== user.id) notFound();
    if (app.status !== "DRAFT") redirect(`/parent/applications/${id}`);

    // Build the available-levels list for the requested-level dropdown,
    // sourced from real classes in the cycle's target year.
    const targetYear = await db.academicYear.findUnique({
      where: { tenantId_label: { tenantId, label: app.cycle.targetYearLabel } },
      select: { id: true },
    });
    const targetClasses = targetYear
      ? await db.class.findMany({
          where: { academicYearId: targetYear.id },
          select: { level: true },
          distinct: ["level"],
        })
      : [];
    const availableLevels = sortLevels(targetClasses.map((c) => c.level));

    const stepLabels = ["stepIdentity", "stepFamily", "stepAcademic", "stepReview"] as const;

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${app.childFirstName || "—"} ${app.childLastName || ""}`.trim() || t("newCta")}
            description={`${app.cycle.label} · ${app.cycle.targetYearLabel}`}
          />

          {/* Stepper */}
          <ol className="flex items-center gap-2 overflow-x-auto text-xs">
            {stepLabels.map((key, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <li key={key} className="flex items-center gap-2">
                  <a
                    href={`/parent/applications/${id}/edit?step=${n}`}
                    className={`flex h-7 items-center gap-2 rounded-full border px-3 transition ${
                      active
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                        : done
                          ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                          : "border-[color:var(--border)] text-[color:var(--muted-fg)] hover:bg-[color:var(--muted)]"
                    }`}
                  >
                    <span className="font-mono">{n}</span>
                    <span>{t(key)}</span>
                  </a>
                  {n < TOTAL_STEPS ? (
                    <span className="text-[color:var(--muted-fg)]">›</span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <Card>
            <CardHeader title={t(stepLabels[step - 1]!)} description={t("stepLabel", { n: step, total: TOTAL_STEPS })} />
            <CardBody>
              {step === 1 ? (
                <IdentityStepForm
                  applicationId={id}
                  initial={{
                    childFirstName: app.childFirstName,
                    childLastName: app.childLastName,
                    childDob: app.childDob ? app.childDob.toISOString().slice(0, 10) : "",
                    childGender: app.childGender ?? "",
                    childNationality: app.childNationality ?? "",
                    childPlaceOfBirth: app.childPlaceOfBirth ?? "",
                  }}
                />
              ) : null}

              {step === 2 ? (
                <FamilyStepForm
                  applicationId={id}
                  initial={{
                    primaryParentName: app.primaryParentName ?? "",
                    primaryParentPhone: app.primaryParentPhone ?? "",
                    primaryParentEmail: app.primaryParentEmail ?? "",
                    secondaryParentName: app.secondaryParentName ?? "",
                    secondaryParentPhone: app.secondaryParentPhone ?? "",
                    secondaryParentEmail: app.secondaryParentEmail ?? "",
                    address: app.address ?? "",
                    city: app.city ?? "",
                    postalCode: app.postalCode ?? "",
                    country: app.country ?? "",
                  }}
                />
              ) : null}

              {step === 3 ? (
                <AcademicStepForm
                  applicationId={id}
                  availableLevels={availableLevels}
                  targetYearLabel={app.cycle.targetYearLabel}
                  initial={{
                    currentSchool: app.currentSchool ?? "",
                    currentLevel: app.currentLevel ?? "",
                    requestedLevel: app.requestedLevel ?? "",
                    motivationNote: app.motivationNote ?? "",
                  }}
                />
              ) : null}

              {step === 4 ? (
                <ReviewStep
                  app={{
                    childFirstName: app.childFirstName,
                    childLastName: app.childLastName,
                    childDob: app.childDob ? app.childDob.toISOString().slice(0, 10) : "—",
                    childGender: app.childGender ? t(GENDER_KEY[app.childGender] ?? "genderOther") : "—",
                    childNationality: app.childNationality ?? "—",
                    childPlaceOfBirth: app.childPlaceOfBirth ?? "—",
                    primaryParentName: app.primaryParentName ?? "—",
                    primaryParentPhone: app.primaryParentPhone ?? "—",
                    primaryParentEmail: app.primaryParentEmail ?? "—",
                    secondaryParentName: app.secondaryParentName ?? "—",
                    address: [app.address, app.city, app.postalCode, app.country]
                      .filter(Boolean)
                      .join(", ") || "—",
                    currentSchool: app.currentSchool ?? "—",
                    currentLevel: app.currentLevel ?? "—",
                    requestedLevel: app.requestedLevel ?? "—",
                    motivationNote: app.motivationNote ?? "",
                  }}
                  applicationId={id}
                  cancelHref={`/parent/applications/${id}/edit?step=3`}
                  submitLabel={t("stepSubmit")}
                  backLabel={t("stepPrev")}
                  cancelLabel={tCommon("cancel")}
                  draftLabel={t(STATUS_KEY[app.status] ?? "statusDraft")}
                />
              ) : null}
            </CardBody>
          </Card>
        </main>
      </AppShell>
    );
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[color:var(--border)] py-2 last:border-0">
      <dt className="text-sm text-[color:var(--muted-fg)]">{label}</dt>
      <dd className="col-span-2 text-sm">{value || "—"}</dd>
    </div>
  );
}

function ReviewStep({
  app,
  applicationId,
  cancelHref,
  submitLabel,
  backLabel,
  draftLabel,
}: {
  app: Record<string, string>;
  applicationId: string;
  cancelHref: string;
  submitLabel: string;
  backLabel: string;
  cancelLabel: string;
  draftLabel: string;
}) {
  const boundSubmit = submitApplication.bind(null, applicationId);
  return (
    <div className="space-y-5">
      <p className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        {draftLabel}
      </p>
      <dl>
        <Row label="Prénom" value={app.childFirstName ?? ""} />
        <Row label="Nom" value={app.childLastName ?? ""} />
        <Row label="DOB" value={app.childDob ?? ""} />
        <Row label="Genre" value={app.childGender ?? ""} />
        <Row label="Nationalité" value={app.childNationality ?? ""} />
        <Row label="Lieu de naissance" value={app.childPlaceOfBirth ?? ""} />
        <Row label="Parent principal" value={app.primaryParentName ?? ""} />
        <Row label="Téléphone" value={app.primaryParentPhone ?? ""} />
        <Row label="E-mail" value={app.primaryParentEmail ?? ""} />
        <Row label="Second parent" value={app.secondaryParentName ?? ""} />
        <Row label="Adresse" value={app.address ?? ""} />
        <Row label="École actuelle" value={app.currentSchool ?? ""} />
        <Row label="Niveau actuel" value={app.currentLevel ?? ""} />
        <Row label="Niveau demandé" value={app.requestedLevel ?? ""} />
        <Row label="Motivation" value={app.motivationNote ?? ""} />
      </dl>

      <form action={boundSubmit} className="flex items-center justify-between gap-2 pt-2">
        <a
          href={cancelHref}
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          ← {backLabel}
        </a>
        <Button type="submit">{submitLabel}</Button>
      </form>
    </div>
  );
}
