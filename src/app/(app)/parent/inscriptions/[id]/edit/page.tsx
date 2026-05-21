import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { loadEntityFieldsConfig, listEstablishments } from "../../../../settings/_actions";
import { DossierEditClient } from "./_client";
import { DossierIdentitySection } from "./_identity-section";

const STATUS_TONE: Record<string, string> = {
  DRAFT:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  SUBMITTED:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  UNDER_REVIEW:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  INTERVIEW_SCHEDULED:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  ACCEPTED:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  WAITLISTED:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DECLINED:
    "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
};

export default async function DossierEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withTenantSession(async (user) => {
    if (user.role !== "PARENT") notFound();
    const t = await getTranslations("admissions");

    const [app, parentFieldsConfig, studentFieldsConfig, establishmentsRaw] =
      await Promise.all([
        db.application.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            submittedByUserId: true,
            childFirstName: true,
            childLastName: true,
            childDob: true,
            niveau: true,
            establishmentId: true,
            parentAnswers: true,
            studentAnswers: true,
            establishment: { select: { name: true } },
            cycle: { select: { label: true, targetYearLabel: true } },
          },
        }),
        loadEntityFieldsConfig("parent"),
        loadEntityFieldsConfig("student"),
        listEstablishments(),
      ]);

    if (!app) notFound();
    if (app.submittedByUserId !== user.id) notFound();

    // Need User columns (firstName / lastName / email) for parent-field
    // userBoundTo pre-fill. Session only has limited User data, so do a
    // tenant-scoped read.
    const sessionUser = await db.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, name: true, email: true },
    });

    // Coerce JSON answers to flat string maps for the renderer.
    const coerceAnswers = (raw: unknown): Record<string, string> => {
      if (!raw || typeof raw !== "object") return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
        else if (v != null) out[k] = String(v);
      }
      return out;
    };

    const establishmentsForRenderer = establishmentsRaw
      .filter((e) => e.isActive)
      .map((e) => ({
        id: e.id,
        name: e.name,
        levels: Array.isArray(e.levels)
          ? (e.levels.filter((x) => typeof x === "string") as string[])
          : [],
      }));

    const statusKey = `status${app.status.charAt(0)}${app.status.slice(1).toLowerCase().replace(/_(.)/g, (_, c) => c.toUpperCase())}`;
    // The mapping above produces "statusDraft", "statusSubmitted",
    // "statusUnderReview", "statusInterviewScheduled" etc. — match the
    // existing i18n keys' casing.

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader
          title={`${app.childLastName} ${app.childFirstName}`.trim()}
          description={`${app.cycle.label} · ${app.cycle.targetYearLabel}`}
          action={
            <Link
              href="/parent/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {t("backToDashboard")}
            </Link>
          }
        />

        {/* Status chip — small, header-adjacent, no longer a full card */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_TONE[app.status] ?? STATUS_TONE.DRAFT,
            )}
          >
            {t(statusKey as never)}
          </span>
        </div>

        {/* Editable identity section — pre-filled with what the parent
            entered during dossier creation. They can correct + save. */}
        <Card>
          <CardHeader title={t("dossierIdentityTitle")} />
          <CardBody>
            <DossierIdentitySection
              applicationId={app.id}
              disabled={
                app.status !== "DRAFT" && app.status !== "SUBMITTED"
              }
              initial={{
                childFirstName: app.childFirstName ?? "",
                childLastName: app.childLastName ?? "",
                childDob: app.childDob
                  ? app.childDob.toISOString().slice(0, 10)
                  : "",
                establishmentId: app.establishmentId ?? "",
                niveau: app.niveau ?? "",
              }}
              establishments={establishmentsForRenderer}
            />
          </CardBody>
        </Card>

        <DossierEditClient
          applicationId={app.id}
          status={app.status}
          parentConfig={parentFieldsConfig}
          studentConfig={studentFieldsConfig}
          parentInitial={coerceAnswers(app.parentAnswers)}
          studentInitial={coerceAnswers(app.studentAnswers)}
          establishments={establishmentsForRenderer}
          user={{
            firstName: sessionUser?.firstName ?? null,
            lastName: sessionUser?.lastName ?? null,
            name: sessionUser?.name ?? null,
            email: sessionUser?.email ?? null,
          }}
          dossier={{
            childFirstName: app.childFirstName ?? null,
            childLastName: app.childLastName ?? null,
            childDob: app.childDob
              ? app.childDob.toISOString().slice(0, 10)
              : null,
            establishment: app.establishment?.name ?? null,
            niveau: app.niveau ?? null,
          }}
        />
      </main>
    );
  });
}
