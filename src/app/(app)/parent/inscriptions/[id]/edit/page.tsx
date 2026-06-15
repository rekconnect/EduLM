import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { db, unscopedDb } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  DOSSIER_TABS,
  parseTabsCompleted,
  parseTabsConfig,
  type DossierTab,
} from "@/lib/dossier-tabs";
import {
  parseTenantInscriptionFormConfig,
  type DossierLocale,
} from "@/lib/inscription-fields-resolver";
import { TenantConfigProvider } from "@/components/dossier/tenant-config-context";
import { DossierTabStrip } from "@/components/dossier/tab-strip";
import {
  DossierBottomBar,
  DossierRemainingPill,
} from "@/components/dossier/bottom-bar";
import {
  loadEntityFieldsConfig,
  listEstablishments,
} from "../../../../settings/_actions";
import { DossierTabPlaceholder } from "./_tab-placeholder";
import { CancelApplicationDialog } from "./_cancel-dialog";
import { DossierTabFoyer } from "./_tab-foyer";
import { DossierResponsablesParents } from "./_tab-responsables-parents";
import { relKindOf, guardianToParentAnswers } from "@/lib/guardian-prefill";
import { DossierTabAutorisations } from "./_tab-autorisations";
import { DossierTabScolarite } from "./_tab-scolarite";
import { DossierTabTransport } from "./_tab-transport";
import { EleveEtatCivilSection } from "./_section-eleve-etat-civil";
import { ElevePassportSection } from "./_section-eleve-passport";
import { ResponsableFooter } from "./_section-responsable-footer";
import {
  parseScolarite,
  parseTransport,
} from "@/lib/dossier-content";
import { parsePedagogique } from "@/lib/pedagogique";
import { DossierTabContacts } from "./_tab-contacts";
import { DossierTabSante } from "./_tab-sante";
import { DossierTabFinance } from "./_tab-finance";
import { parseSante, parseFinance } from "@/lib/dossier-content";
import { DossierTabValidation } from "./_tab-validation";

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

function parseTab(raw: string | undefined): DossierTab {
  if (raw && (DOSSIER_TABS as readonly string[]).includes(raw)) {
    return raw as DossierTab;
  }
  return "eleve";
}

export default async function DossierEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const currentTab = parseTab(tab);

  return withTenantSession(async (user) => {
    if (user.role !== "PARENT") notFound();
    const t = await getTranslations("admissions");
    const tDossier = await getTranslations("dossier");

    const [
      app,
      parentFieldsConfig,
      studentFieldsConfig,
      establishmentsRaw,
      tenant,
      guardian,
    ] = await Promise.all([
      db.application.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          submittedByUserId: true,
          existingStudentId: true,
          childFirstName: true,
          childLastName: true,
          childDob: true,
          childGender: true,
          childPlaceOfBirth: true,
          childBirthCountry: true,
          childIsLebanese: true,
          childPassportLebanese: true,
          childNationality: true,
          childNationality2: true,
          childFirstNameAr: true,
          childLastNameAr: true,
          childPlaceOfBirthAr: true,
          submitterIsLebanese: true,
          submitterPassportLebanese: true,
          submitterNationality: true,
          submitterNationality2: true,
          submitterRelation: true,
          monoParental: true,
          niveau: true,
          establishmentId: true,
          parentAnswers: true,
          studentAnswers: true,
          dossierAnswers: true,
          tabsCompleted: true,
          establishment: { select: { name: true } },
          cycle: {
            select: {
              label: true,
              targetYearLabel: true,
              schoolStartDate: true,
            },
          },
          siblings: {
            orderBy: { order: "asc" },
            select: {
              firstName: true,
              birthYear: true,
              className: true,
              schoolName: true,
            },
          },
          contacts: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              kind: true,
              firstName: true,
              lastName: true,
              relation: true,
              phoneMobile: true,
              phoneHome: true,
            },
          },
          responsables: {
            orderBy: { order: "asc" },
            select: { id: true, kind: true, customAnswers: true },
          },
        },
      }),
      loadEntityFieldsConfig("parent"),
      loadEntityFieldsConfig("student"),
      listEstablishments(),
      user.tenantId
        ? unscopedDb().tenant.findUnique({
            where: { id: user.tenantId },
            select: {
              inscriptionTabsConfig: true,
              inscriptionFormConfig: true,
              name: true,
            },
          })
        : Promise.resolve(null),
      db.guardian.findUnique({
        where: { userId: user.id },
        select: {
          family: {
            select: {
              addressStreet: true,
              addressHood: true,
              addressCity: true,
              imageRightsSite: true,
              imageRightsBook: true,
              imageRightsSocial: true,
              imageRightsRadio: true,
            },
          },
        },
      }),
    ]);

    if (!app) notFound();
    if (app.submittedByUserId !== user.id) notFound();

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

    // Renewal: the schooling tab (établissement précédent, EBEP, examens…)
    // is only meaningful for a brand-new pupil. Hide it for re-inscriptions so
    // the parent isn't asked to re-fill it and it doesn't block submission.
    const isRenewal = app.existingStudentId != null;

    // Two-parent editor rows. Real ApplicationResponsable rows if they exist;
    // otherwise synthesize prefilled rows from the family's guardians so the
    // parent sees them filled — saving a card then persists the real row.
    // Renewal → the student's guardians; new inscription → the submitting
    // parent's family guardians (created at sign-up).
    let responsableRows = app.responsables.map((r) => ({
      id: r.id,
      kind: r.kind as "PERE" | "MERE" | "TUTEUR" | "AUTRE",
      answers: coerceAnswers(r.customAnswers),
    }));
    if (responsableRows.length === 0) {
      const guardianSelect = {
        relation: true,
        nationality1: true,
        nationality2: true,
        user: {
          select: { firstName: true, lastName: true, name: true, email: true, customAnswers: true },
        },
      } as const;
      let sourceGuardians: Array<{
        relation: string | null;
        nationality1: string | null;
        nationality2: string | null;
        user: { firstName: string | null; lastName: string | null; name: string | null; email: string; customAnswers: unknown };
      }> = [];
      if (app.existingStudentId) {
        const links = await db.studentGuardian.findMany({
          where: { studentId: app.existingStudentId },
          orderBy: { isPrimary: "desc" },
          select: { guardian: { select: guardianSelect } },
        });
        sourceGuardians = links.map((l) => l.guardian);
      } else {
        // New inscription: the submitter's family guardians (incl. the one(s)
        // entered at sign-up). Fall back to the submitter's own account.
        const me = await db.guardian.findUnique({
          where: { userId: user.id },
          select: {
            ...guardianSelect,
            family: { select: { guardians: { select: guardianSelect } } },
          },
        });
        if (me?.family?.guardians?.length) sourceGuardians = me.family.guardians;
        else if (me) sourceGuardians = [me];
      }
      responsableRows = sourceGuardians.map((g, i) => ({
        id: `new-${relKindOf(g.relation).toLowerCase()}-${i}`,
        kind: relKindOf(g.relation),
        answers: guardianToParentAnswers(g),
      }));
    }

    const baseTabsConfig = parseTabsConfig(tenant?.inscriptionTabsConfig);
    const tabsConfig = isRenewal
      ? { ...baseTabsConfig, scolarite: false }
      : baseTabsConfig;
    const tabsCompleted = parseTabsCompleted(app.tabsCompleted);

    // WYSIWYG editor (Phase 2) — parse the tenant's per-field overrides
    // once and hand them down through context. The Élève tab consumes it
    // via useField() in Phase 2; other tabs follow in Phase 4.
    const inscriptionFormConfig = parseTenantInscriptionFormConfig(
      tenant?.inscriptionFormConfig,
    );
    const localeStr = await getLocale();
    const dossierLocale: DossierLocale =
      localeStr === "en" || localeStr === "ar" ? localeStr : "fr";

    // Map ApplicationStatus enum → i18n key. We don't auto-generate
    // these because the enum name and i18n key don't always match
    // (e.g. INTERVIEW_SCHEDULED → statusInterview, not
    // statusInterviewScheduled). Mirrors the explicit STATUS_KEY map
    // in /admissions-admin/[id]/page.tsx.
    const STATUS_KEY_MAP: Record<string, string> = {
      DRAFT: "statusDraft",
      SUBMITTED: "statusSubmitted",
      UNDER_REVIEW: "statusUnderReview",
      INTERVIEW_SCHEDULED: "statusInterview",
      ACCEPTED: "statusAccepted",
      WAITLISTED: "statusWaitlisted",
      DECLINED: "statusDeclined",
      WITHDRAWN: "statusWithdrawn",
    };
    const statusKey = STATUS_KEY_MAP[app.status] ?? "statusSubmitted";

    const baseHref = `/parent/inscriptions/${app.id}/edit`;
    const editable = app.status === "DRAFT" || app.status === "SUBMITTED";

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
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

        {/* Status + À COMPLÉTER pill on one row */}
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_TONE[app.status] ?? STATUS_TONE.DRAFT,
            )}
          >
            {t(statusKey as never)}
          </span>
          <DossierRemainingPill
            visibility={tabsConfig}
            completed={tabsCompleted}
          />
        </div>

        {/* Intro + required-hint banner, only on DRAFT for first-time users */}
        {editable ? (
          <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]">
            <p>{tDossier("intro")}</p>
            <p className="mt-1 text-[color:var(--color-danger)]">
              {tDossier("requiredHint")}
            </p>
          </div>
        ) : null}

        <DossierTabStrip
          baseHref={baseHref}
          current={currentTab}
          visibility={tabsConfig}
          completed={tabsCompleted}
        />

        {/* ── Tab content ──
            Wrapped in TenantConfigProvider so every section can read
            tenant per-field overrides via useField(). Phase 2 only
            consumes it inside the two Élève sections; Phase 4 threads
            the remaining 9 tabs. */}
        <TenantConfigProvider
          config={inscriptionFormConfig}
          locale={dossierLocale}
        >
        <div className="space-y-6">
          {currentTab === "eleve" ? (
            <>
              <EleveEtatCivilSection
                applicationId={app.id}
                disabled={!editable}
                initial={{
                  childFirstName: app.childFirstName ?? "",
                  childLastName: app.childLastName ?? "",
                  childDob: app.childDob
                    ? app.childDob.toISOString().slice(0, 10)
                    : "",
                  childGender: app.childGender ?? "",
                  childPlaceOfBirth: app.childPlaceOfBirth ?? "",
                  childBirthCountry: app.childBirthCountry ?? "",
                  childFirstNameAr: app.childFirstNameAr ?? "",
                  childLastNameAr: app.childLastNameAr ?? "",
                  childPlaceOfBirthAr: app.childPlaceOfBirthAr ?? "",
                }}
              />

              <ElevePassportSection
                applicationId={app.id}
                disabled={!editable}
                initial={{
                  childIsLebanese: app.childIsLebanese,
                  childPassportLebanese: app.childPassportLebanese ?? "",
                  childNationality: app.childNationality ?? "",
                  childNationality2: app.childNationality2 ?? "",
                }}
              />
            </>
          ) : null}

          {currentTab === "responsables" ? (
            <DossierResponsablesParents
              applicationId={app.id}
              disabled={!editable}
              parentConfig={parentFieldsConfig}
              establishments={establishmentsForRenderer}
              initial={responsableRows}
            />
          ) : null}

          {currentTab === "responsables" ? (
            <ResponsableFooter
              applicationId={app.id}
              disabled={!editable}
              initialMonoParental={app.monoParental}
            />
          ) : null}

          {/* ── Phase 2 tabs ── */}
          {currentTab === "foyer" ? (() => {
            const dossier =
              app.dossierAnswers &&
              typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            const foyerExtras =
              dossier.foyer && typeof dossier.foyer === "object"
                ? (dossier.foyer as Record<string, unknown>)
                : {};
            const fam = guardian?.family;
            return (
              <DossierTabFoyer
                applicationId={app.id}
                disabled={!editable}
                initial={{
                  addressCaza: fam?.addressCity ?? "",
                  addressVillage: fam?.addressHood ?? "",
                  addressStreet: fam?.addressStreet ?? "",
                  addressBuilding:
                    typeof foyerExtras.building === "string"
                      ? foyerExtras.building
                      : "",
                  addressFloor:
                    typeof foyerExtras.floor === "string"
                      ? foyerExtras.floor
                      : "",
                  addressDetails:
                    typeof foyerExtras.details === "string"
                      ? foyerExtras.details
                      : "",
                  addressNotes:
                    typeof foyerExtras.notes === "string"
                      ? foyerExtras.notes
                      : "",
                  siblings: app.siblings.map((s) => ({
                    firstName: s.firstName,
                    birthYear: s.birthYear != null ? String(s.birthYear) : "",
                    className: s.className ?? "",
                    schoolName: s.schoolName ?? "",
                  })),
                }}
              />
            );
          })() : null}

          {currentTab === "scolarite" && !isRenewal ? (() => {
            const dossier =
              app.dossierAnswers &&
              typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            return (
              <DossierTabScolarite
                applicationId={app.id}
                disabled={!editable}
                initial={parseScolarite(dossier.scolarite)}
                initialEstablishmentId={app.establishmentId ?? ""}
                initialNiveau={app.niveau ?? ""}
                initialPedagogique={parsePedagogique(dossier.pedagogique)}
                establishments={establishmentsForRenderer}
                schoolName={tenant?.name ?? ""}
                defaultEntryDate={
                  app.cycle.schoolStartDate
                    ? app.cycle.schoolStartDate.toISOString().slice(0, 10)
                    : ""
                }
              />
            );
          })() : null}

          {currentTab === "autorisations" ? (() => {
            const dossier =
              app.dossierAnswers && typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            const autz =
              dossier.autorisations && typeof dossier.autorisations === "object"
                ? (dossier.autorisations as Record<string, unknown>)
                : {};
            return (
              <DossierTabAutorisations
                applicationId={app.id}
                disabled={!editable}
                initial={{
                  imageRightsSite: guardian?.family?.imageRightsSite ?? null,
                  imageRightsBook: guardian?.family?.imageRightsBook ?? null,
                  imageRightsSocial: guardian?.family?.imageRightsSocial ?? null,
                  imageRightsRadio: guardian?.family?.imageRightsRadio ?? null,
                  quitterSeul:
                    typeof autz.quitterSeul === "boolean" ? autz.quitterSeul : null,
                }}
              />
            );
          })() : null}

          {currentTab === "transport" ? (() => {
            const dossier =
              app.dossierAnswers &&
              typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            return (
              <DossierTabTransport
                applicationId={app.id}
                disabled={!editable}
                niveau={app.niveau}
                initial={parseTransport(dossier.transport)}
              />
            );
          })() : null}

          {currentTab === "contacts" ? (
            <DossierTabContacts
              applicationId={app.id}
              disabled={!editable}
              initial={app.contacts.map((c) => ({
                id: c.id,
                kind: c.kind,
                firstName: c.firstName,
                lastName: c.lastName,
                relation: c.relation,
                phoneMobile: c.phoneMobile,
                phoneHome: c.phoneHome,
              }))}
            />
          ) : null}

          {currentTab === "sante" ? (() => {
            const dossier =
              app.dossierAnswers && typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            return (
              <DossierTabSante
                applicationId={app.id}
                disabled={!editable}
                initial={parseSante(dossier.sante)}
              />
            );
          })() : null}

          {currentTab === "finance" ? (() => {
            const dossier =
              app.dossierAnswers && typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            return (
              <DossierTabFinance
                applicationId={app.id}
                disabled={!editable}
                initial={parseFinance(dossier.finance)}
              />
            );
          })() : null}

          {currentTab === "validation" ? (() => {
            const dossier =
              app.dossierAnswers && typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            const validation =
              dossier.validation && typeof dossier.validation === "object"
                ? (dossier.validation as Record<string, unknown>)
                : {};
            return (
              <DossierTabValidation
                applicationId={app.id}
                disabled={!editable}
                acknowledged={validation.acknowledged === true}
                documentsListMarkdown=""
              />
            );
          })() : null}

          {/* Justificatifs tab still falls through to the placeholder
              for now — Phase 5 will hook it up to the existing
              ApplicationDocument upload flow. */}
          {currentTab === "justificatifs" ? (
            <DossierTabPlaceholder
              applicationId={app.id}
              tab={currentTab}
              completed={tabsCompleted[currentTab] === true}
            />
          ) : null}
        </div>
        </TenantConfigProvider>

        <DossierBottomBar
          baseHref={baseHref}
          current={currentTab}
          visibility={tabsConfig}
          completed={tabsCompleted}
          applicationId={editable ? app.id : undefined}
        />

        {/* Cancel-application affordance — DRAFT only. The action
            hard-deletes the row, so we hide the trigger for any
            submitted / decided status. SUBMITTED applications need a
            separate "Retirer" (withdraw) flow that sets status =
            WITHDRAWN without losing the data — follow-up task. */}
        {app.status === "DRAFT" ? (
          <div className="flex justify-end pt-2">
            <CancelApplicationDialog applicationId={app.id} />
          </div>
        ) : null}
      </main>
    );
  });
}
