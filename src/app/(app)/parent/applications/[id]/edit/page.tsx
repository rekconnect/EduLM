import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import {
  getFieldLabel,
  getFieldVisibility,
  parseFieldConfig,
  type CustomQuestion,
  type CycleFieldConfig,
  type RequiredDocument,
} from "@/lib/admission-fields";
import { getSignedDownloadUrl } from "@/lib/storage";
import { submitApplication } from "../../_actions";
import { IdentityStepForm, FamilyStepForm, AcademicStepForm } from "./_step-forms";
import { ReviewSubmitButton } from "./_submit-button";
import { CancelApplicationDialog } from "./_cancel-dialog";
import { DocumentsSection, type UploadedDocSummary } from "./_documents";

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
      include: {
        cycle: {
          select: {
            label: true,
            targetYearLabel: true,
            fieldConfig: true,
          },
        },
        answers: { select: { questionId: true, value: true } },
        documents: {
          select: {
            requirementId: true,
            filename: true,
            fileSizeBytes: true,
            storagePath: true,
          },
        },
      },
    });
    if (!app) notFound();
    const fieldConfig = parseFieldConfig(app.cycle.fieldConfig);
    const customQuestions = fieldConfig.customQuestions ?? [];
    const requiredDocuments = fieldConfig.requiredDocuments ?? [];
    const initialAnswers: Record<string, string> = {};
    for (const a of app.answers) initialAnswers[a.questionId] = a.value;

    // Pre-sign download URLs for each uploaded document so the client can
    // link directly (signed URLs expire in 1h — long enough for a session).
    const uploads: Record<string, UploadedDocSummary | undefined> = {};
    for (const d of app.documents) {
      uploads[d.requirementId] = {
        filename: d.filename,
        fileSizeBytes: d.fileSizeBytes,
        downloadUrl: await getSignedDownloadUrl(d.storagePath),
      };
    }
    if (app.submittedByUserId !== user.id) notFound();
    // Allow edits while DRAFT or SUBMITTED (no admin review started yet).
    // Anything beyond — UNDER_REVIEW, INTERVIEW_SCHEDULED, ACCEPTED, etc. — is
    // locked and viewed read-only.
    const canEdit = app.status === "DRAFT" || app.status === "SUBMITTED";
    if (!canEdit) redirect(`/parent/applications/${id}`);
    const isSubmitted = app.status === "SUBMITTED";

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

    const stepLabels = [
      "stepIdentity",
      "stepFamily",
      "stepAcademic",
      "stepReview",
    ] as const;

    return (
        <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
          <PageHeader
            title={
              `${app.childFirstName || "—"} ${app.childLastName || ""}`.trim() ||
              t("newCta")
            }
            description={`${app.cycle.label} · ${app.cycle.targetYearLabel}`}
            action={
              isSubmitted ? undefined : <CancelApplicationDialog applicationId={id} />
            }
          />

          {isSubmitted ? (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] px-4 py-3 text-sm text-[color:var(--color-brand-700)]">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">{t("editingSubmittedTitle")}</p>
                <p className="mt-0.5 text-[color:var(--color-brand-700)]/85">
                  {t("editingSubmittedDesc")}
                </p>
              </div>
            </div>
          ) : null}

          {/* Stepper */}
          <ol className="flex items-center gap-1 sm:gap-2" aria-label="Steps">
            {stepLabels.map((key, i) => {
              const n = i + 1;
              const isActive = n === step;
              const isDone = n < step;
              const isLast = i === stepLabels.length - 1;
              return (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-1 sm:gap-2",
                    !isLast && "flex-1",
                  )}
                >
                  <a
                    href={`/parent/applications/${id}/edit?step=${n}`}
                    aria-current={isActive ? "step" : undefined}
                    className="group flex min-w-0 flex-col items-start gap-1.5"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 ease-out",
                        isActive &&
                          "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] ring-4 ring-[color:var(--color-brand-500)]/15",
                        isDone &&
                          "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]",
                        !isActive &&
                          !isDone &&
                          "border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)] group-hover:border-[color:var(--color-brand-500)] group-hover:text-[color:var(--color-brand-600)]",
                      )}
                    >
                      {isDone ? <Check className="size-4" strokeWidth={3} /> : n}
                    </span>
                    <span
                      className={cn(
                        "hidden text-xs font-medium uppercase tracking-wider sm:inline",
                        isActive
                          ? "text-[color:var(--color-foreground)]"
                          : isDone
                            ? "text-[color:var(--color-brand-600)]"
                            : "text-[color:var(--color-foreground-muted)]",
                      )}
                    >
                      {t(key)}
                    </span>
                  </a>
                  {!isLast ? (
                    <span
                      aria-hidden
                      className={cn(
                        "mt-[-1.25rem] h-px flex-1 transition-colors duration-200",
                        isDone
                          ? "bg-[color:var(--color-brand-500)]"
                          : "bg-[color:var(--color-border-subtle)]",
                      )}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          {/* Step content */}
          <div
            key={step}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none space-y-6"
          >
            <Card>
              <CardHeader
                title={t(stepLabels[step - 1]!)}
                description={t("stepLabel", { n: step, total: TOTAL_STEPS })}
              />
              <CardBody>
                {step <= 3 && fieldConfig.stepIntros?.[
                  step === 1 ? "identity" : step === 2 ? "family" : "academic"
                ] ? (
                  <p className="mb-5 whitespace-pre-line rounded-md border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] px-4 py-3 text-sm leading-relaxed text-[color:var(--color-brand-700)]">
                    {fieldConfig.stepIntros[
                      step === 1 ? "identity" : step === 2 ? "family" : "academic"
                    ]}
                  </p>
                ) : null}
                {step === 1 ? (
                  <IdentityStepForm
                    applicationId={id}
                    fieldConfig={fieldConfig}
                    initial={{
                      childFirstName: app.childFirstName,
                      childLastName: app.childLastName,
                      childDob: app.childDob
                        ? app.childDob.toISOString().slice(0, 10)
                        : "",
                      childGender: app.childGender ?? "",
                      childNationality: app.childNationality ?? "",
                      childPlaceOfBirth: app.childPlaceOfBirth ?? "",
                    }}
                  />
                ) : null}

                {step === 2 ? (
                  <FamilyStepForm
                    applicationId={id}
                    fieldConfig={fieldConfig}
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
                    fieldConfig={fieldConfig}
                    availableLevels={availableLevels}
                    targetYearLabel={app.cycle.targetYearLabel}
                    customQuestions={customQuestions}
                    initialAnswers={initialAnswers}
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
                    fieldConfig={fieldConfig}
                    customQuestions={customQuestions}
                    answers={initialAnswers}
                    app={{
                      childFirstName: app.childFirstName,
                      childLastName: app.childLastName,
                      childDob: app.childDob
                        ? app.childDob.toISOString().slice(0, 10)
                        : "—",
                      childGender: app.childGender
                        ? t(GENDER_KEY[app.childGender] ?? "genderOther")
                        : "—",
                      childNationality: app.childNationality ?? "—",
                      childPlaceOfBirth: app.childPlaceOfBirth ?? "—",
                      primaryParentName: app.primaryParentName ?? "—",
                      primaryParentPhone: app.primaryParentPhone ?? "—",
                      primaryParentEmail: app.primaryParentEmail ?? "—",
                      secondaryParentName: app.secondaryParentName ?? "—",
                      address:
                        [app.address, app.city, app.postalCode, app.country]
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
                    submitPendingLabel={tCommon("loading")}
                    backLabel={t("stepPrev")}
                    cancelLabel={tCommon("cancel")}
                    draftLabel={t(STATUS_KEY[app.status] ?? "statusDraft")}
                    isSubmitted={isSubmitted}
                    viewHref={`/parent/applications/${id}`}
                    doneLabel={t("reviewDoneLabel")}
                  />
                ) : null}
              </CardBody>
            </Card>

            {step === 3 && requiredDocuments.length > 0 ? (
              <Card>
                <CardHeader title={t("requiredDocsParentHeading")} />
                <CardBody>
                  <DocumentsSection
                    applicationId={id}
                    requirements={requiredDocuments}
                    uploads={uploads}
                  />
                </CardBody>
              </Card>
            ) : null}
          </div>
        </main>
    );
  });
}

function formatAnswer(question: CustomQuestion, raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (question.type === "yes_no") {
    return v === "yes" ? "Oui" : v === "no" ? "Non" : v;
  }
  return v;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[color:var(--color-border-subtle)] py-2.5 last:border-0">
      <dt className="text-sm text-[color:var(--color-foreground-muted)]">
        {label}
      </dt>
      <dd className="col-span-2 text-sm text-[color:var(--color-foreground)]">
        {value || "—"}
      </dd>
    </div>
  );
}

function ReviewStep({
  app,
  applicationId,
  cancelHref,
  submitLabel,
  submitPendingLabel,
  backLabel,
  draftLabel,
  isSubmitted,
  viewHref,
  doneLabel,
  fieldConfig,
  customQuestions,
  answers,
}: {
  app: Record<string, string>;
  applicationId: string;
  cancelHref: string;
  submitLabel: string;
  submitPendingLabel: string;
  backLabel: string;
  cancelLabel: string;
  draftLabel: string;
  isSubmitted: boolean;
  viewHref: string;
  doneLabel: string;
  fieldConfig: CycleFieldConfig;
  customQuestions: CustomQuestion[];
  answers: Record<string, string>;
}) {
  const boundSubmit = submitApplication.bind(null, applicationId);
  // Don't show fields the cycle has hidden — they have no value and would
  // mislead the parent on what was actually submitted.
  const visible = (key: string) =>
    getFieldVisibility(fieldConfig, key) !== "hidden";

  return (
    <div className="space-y-5">
      <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunken)] px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
        {draftLabel}
      </span>
      <dl>
        {visible("childFirstName") ? (
          <Row label={getFieldLabel(fieldConfig, "childFirstName", "Prénom")} value={app.childFirstName ?? ""} />
        ) : null}
        {visible("childLastName") ? (
          <Row label={getFieldLabel(fieldConfig, "childLastName", "Nom")} value={app.childLastName ?? ""} />
        ) : null}
        {visible("childDob") ? (
          <Row label={getFieldLabel(fieldConfig, "childDob", "Date de naissance")} value={app.childDob ?? ""} />
        ) : null}
        {visible("childGender") ? (
          <Row label={getFieldLabel(fieldConfig, "childGender", "Genre")} value={app.childGender ?? ""} />
        ) : null}
        {visible("childNationality") ? (
          <Row label={getFieldLabel(fieldConfig, "childNationality", "Nationalité")} value={app.childNationality ?? ""} />
        ) : null}
        {visible("childPlaceOfBirth") ? (
          <Row label={getFieldLabel(fieldConfig, "childPlaceOfBirth", "Lieu de naissance")} value={app.childPlaceOfBirth ?? ""} />
        ) : null}
        {visible("primaryParentName") ? (
          <Row label={getFieldLabel(fieldConfig, "primaryParentName", "Parent principal")} value={app.primaryParentName ?? ""} />
        ) : null}
        {visible("primaryParentPhone") ? (
          <Row label={getFieldLabel(fieldConfig, "primaryParentPhone", "Téléphone")} value={app.primaryParentPhone ?? ""} />
        ) : null}
        {visible("primaryParentEmail") ? (
          <Row label={getFieldLabel(fieldConfig, "primaryParentEmail", "E-mail")} value={app.primaryParentEmail ?? ""} />
        ) : null}
        {visible("secondaryParentName") ? (
          <Row label={getFieldLabel(fieldConfig, "secondaryParentName", "Second parent")} value={app.secondaryParentName ?? ""} />
        ) : null}
        {visible("address") ||
        visible("city") ||
        visible("postalCode") ||
        visible("country") ? (
          <Row label={getFieldLabel(fieldConfig, "address", "Adresse")} value={app.address ?? ""} />
        ) : null}
        {visible("currentSchool") ? (
          <Row label={getFieldLabel(fieldConfig, "currentSchool", "École actuelle")} value={app.currentSchool ?? ""} />
        ) : null}
        {visible("currentLevel") ? (
          <Row label={getFieldLabel(fieldConfig, "currentLevel", "Niveau actuel")} value={app.currentLevel ?? ""} />
        ) : null}
        <Row label={getFieldLabel(fieldConfig, "requestedLevel", "Niveau demandé")} value={app.requestedLevel ?? ""} />
        {visible("motivationNote") ? (
          <Row label={getFieldLabel(fieldConfig, "motivationNote", "Motivation")} value={app.motivationNote ?? ""} />
        ) : null}
        {customQuestions.map((q) => (
          <Row
            key={q.id}
            label={q.label}
            value={formatAnswer(q, answers[q.id])}
          />
        ))}
      </dl>

      {isSubmitted ? (
        <div className="flex items-center justify-between gap-2 pt-2">
          <a
            href={cancelHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel}
          </a>
          <Link
            href={viewHref}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-brand-500)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground-onbrand)] shadow-card transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-600)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] active:scale-[0.99]"
          >
            <Check className="size-4" aria-hidden />
            {doneLabel}
          </Link>
        </div>
      ) : (
        <form
          action={boundSubmit}
          className="flex items-center justify-between gap-2 pt-2"
        >
          <a
            href={cancelHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:border-[color:var(--color-border-strong)]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel}
          </a>
          <ReviewSubmitButton
            label={submitLabel}
            pendingLabel={submitPendingLabel}
          />
        </form>
      )}
    </div>
  );
}
