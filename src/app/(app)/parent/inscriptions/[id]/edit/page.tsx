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
import { CancelApplicationDialog } from "./_cancel-dialog";
import { DossierTabFoyer } from "./_tab-foyer";
import { DossierResponsablesParents } from "./_tab-responsables-parents";
import { relKindOf, guardianToParentAnswers } from "@/lib/guardian-prefill";
import { buildKidCode, nextKidIndex } from "@/lib/student-code";
import { DossierTabAutorisations } from "./_tab-autorisations";
import { DossierTabScolarite } from "./_tab-scolarite";
import { DossierTabTransport } from "./_tab-transport";
import { DossierTabEleve } from "./_tab-eleve";
import { ResponsableFooter } from "./_section-responsable-footer";
import {
  parseScolarite,
  parseTransport,
  serviceAnswersFromTransport,
} from "@/lib/dossier-content";
import { parsePedagogique } from "@/lib/pedagogique";
import {
  scolariteAnswers,
  SCOLARITE_IDS,
  SCOLARITE_CATEGORY_NAMES,
} from "@/lib/scolarite-config";
import { DossierTabContacts } from "./_tab-contacts";
import { DossierTabSante } from "./_tab-sante";
import { DossierTabFinance } from "./_tab-finance";
import { DossierTabJustificatifs } from "./_tab-justificatifs";
import {
  parseSante,
  santeAnswers,
  parseFinance,
  financeAnswers,
} from "@/lib/dossier-content";
import {
  fieldVisibleOnForm,
  fieldRequiredOnForm,
} from "@/lib/entity-fields";
import {
  resolveDossierState,
  servicesHiddenInState,
  fieldEditableInState,
} from "@/lib/dossier-state";
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
          dossierState: true,
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
              dossierStateInscription: true,
              dossierStateRenewal: true,
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
              code: true,
              addressStreet: true,
              addressHood: true,
              addressCity: true,
              imageRightsSite: true,
              imageRightsBook: true,
              imageRightsSocial: true,
              imageRightsRadio: true,
              students: { select: { customAnswers: true } },
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

    // ── Élève tab (Dars entity-fields) ──────────────────────────────
    // Render only the student "Info générale" + "Info Arabe" categories;
    // the other categories live on their own tabs (Scolarité/Services/…).
    const studentAnswersMap = coerceAnswers(app.studentAnswers);
    const ELEVE_CATEGORY_NAMES = ["Info générale", "Info Arabe"];
    // Re-inscription (renewal) vs new inscription — drives per-field
    // visibility (renewalHidden / inscriptionHidden) and the required override.
    const isRenewal = app.existingStudentId != null;
    const onForm = (f: (typeof studentFieldsConfig.fields)[number]) =>
      fieldVisibleOnForm(f, { renewal: isRenewal });
    const withReq = <F extends (typeof studentFieldsConfig.fields)[number]>(
      f: F,
    ): F => ({ ...f, required: fieldRequiredOnForm(f, { renewal: isRenewal }) });

    const eleveCats = studentFieldsConfig.categories.filter((c) =>
      ELEVE_CATEGORY_NAMES.includes(c.name),
    );
    const eleveCatIds = new Set(eleveCats.map((c) => c.id));
    const eleveConfig = {
      categories: eleveCats,
      // Exclude formHidden fields — import-/admin-only fields (Dars code,
      // register, inherited community, internal emails) don't belong on the
      // parent form, though they stay on the fiche. On a re-inscription,
      // renewalHidden fields drop out too; inscription-only ones are added.
      fields: studentFieldsConfig.fields
        .filter((f) => eleveCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };
    // Same rule for the Responsables tab parent fields.
    const parentFormConfig = {
      ...parentFieldsConfig,
      fields: parentFieldsConfig.fields.filter(onForm).map(withReq),
    };
    // Prefill: studentAnswers first, then fall back to the legacy columns so
    // dossiers created before the migration still populate the form.
    const eleveInitial: Record<string, string> = {
      ...studentAnswersMap,
      prenom: studentAnswersMap.prenom || app.childFirstName || "",
      nom: studentAnswersMap.nom || app.childLastName || "",
      date_naissance:
        studentAnswersMap.date_naissance ||
        (app.childDob ? app.childDob.toISOString().slice(0, 10) : ""),
      pays_naissance: studentAnswersMap.pays_naissance || app.childBirthCountry || "",
      lieu_naissance: studentAnswersMap.lieu_naissance || app.childPlaceOfBirth || "",
      nationalite: studentAnswersMap.nationalite || app.childNationality || "",
      nationalite2: studentAnswersMap.nationalite2 || app.childNationality2 || "",
      numero_identite: studentAnswersMap.numero_identite || app.childPassportLebanese || "",
      isLebanese:
        studentAnswersMap.isLebanese ||
        (app.childIsLebanese == null ? "" : app.childIsLebanese ? "yes" : "no"),
      nom_prenom_ar:
        studentAnswersMap.nom_prenom_ar ||
        [app.childLastNameAr, app.childFirstNameAr].filter(Boolean).join(" "),
      lieu_naissance_ar: studentAnswersMap.lieu_naissance_ar || app.childPlaceOfBirthAr || "",
      sexe:
        studentAnswersMap.sexe ||
        (app.childGender === "MALE"
          ? "Garçon"
          : app.childGender === "FEMALE"
            ? "Fille"
            : app.childGender === "OTHER"
              ? "Autre"
              : ""),
    };
    // On a re-inscription, fields set to "Vide" (renewalPrefill === "blank")
    // start empty so the parent re-enters them (answers are keyed by field id;
    // clear key too for safety).
    if (isRenewal) {
      for (const f of studentFieldsConfig.fields) {
        if (f.renewalPrefill === "blank") {
          delete eleveInitial[f.id];
          delete eleveInitial[f.key];
        }
      }
    }

    // ── Autorisations tab (Dars entity-fields) ──────────────────────
    const autorisationsCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Autorisations",
    );
    const autCatIds = new Set(autorisationsCats.map((c) => c.id));
    const autorisationsConfig = {
      categories: autorisationsCats,
      fields: studentFieldsConfig.fields
        .filter((f) => autCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    // ── Transport & restauration tab (Dars entity-fields) ──────────
    // The "Services" category carries the exact Dars registration vocabulary
    // (transport_aller/retour, collations, repas_chaud, alt address).
    const transportCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Services",
    );
    const transportCatIds = new Set(transportCats.map((c) => c.id));
    const transportConfig = {
      categories: transportCats,
      fields: studentFieldsConfig.fields
        .filter((f) => transportCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    // ── Contacts tab (Dars entity-fields) — two repeaters (urgence/pickup). ──
    const contactsCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Contacts",
    );
    const contactsCatIds = new Set(contactsCats.map((c) => c.id));
    const contactsConfig = {
      categories: contactsCats,
      fields: studentFieldsConfig.fields
        .filter((f) => contactsCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    // ── Foyer tab (Dars entity-fields) — address (cascade) + siblings repeater. ──
    const foyerCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Foyer",
    );
    const foyerCatIds = new Set(foyerCats.map((c) => c.id));
    const foyerConfig = {
      categories: foyerCats,
      fields: studentFieldsConfig.fields
        .filter((f) => foyerCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    // ── Santé tab (Dars entity-fields). ──
    const santeCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Santé",
    );
    const santeCatIds = new Set(santeCats.map((c) => c.id));
    const santeConfig = {
      categories: santeCats,
      fields: studentFieldsConfig.fields
        .filter((f) => santeCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    // ── Finance tab (Dars entity-fields). ──
    const financeCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Finance",
    );
    const financeCatIds = new Set(financeCats.map((c) => c.id));
    const financeConfig = {
      categories: financeCats,
      fields: studentFieldsConfig.fields
        .filter((f) => financeCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    // ── Justificatifs tab (Dars entity-fields) — file fields. ──
    const justifCats = studentFieldsConfig.categories.filter(
      (c) => c.name === "Justificatifs",
    );
    const justifCatIds = new Set(justifCats.map((c) => c.id));
    const justificatifsConfig = {
      categories: justifCats,
      fields: studentFieldsConfig.fields
        .filter((f) => justifCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };
    // ── Scolarité tab (Dars entity-fields) — 4 "Scolarité (dossier)" sections. ──
    const scolariteCats = studentFieldsConfig.categories.filter((c) =>
      SCOLARITE_CATEGORY_NAMES.includes(c.name),
    );
    const scolariteCatIds = new Set(scolariteCats.map((c) => c.id));
    const scolariteConfig = {
      categories: scolariteCats,
      fields: studentFieldsConfig.fields
        .filter((f) => scolariteCatIds.has(f.categoryId) && onForm(f))
        .map(withReq),
    };

    const boolYn = (b: boolean | null | undefined) =>
      b === true ? "yes" : b === false ? "no" : "";

    // (isRenewal computed above — drives field visibility + the schooling tab,
    // which is only meaningful for a brand-new pupil.)

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

    // Dossier "state" gates the Services (Transport & restauration) tab + the
    // editability of the rest. Per-dossier override → tenant default per context.
    const dossierState = resolveDossierState(
      app.dossierState,
      isRenewal ? tenant?.dossierStateRenewal : tenant?.dossierStateInscription,
    );
    const servicesHidden = servicesHiddenInState(dossierState);
    const otherEditable = fieldEditableInState(dossierState, {
      isService: false,
      baseEditable: editable,
    });
    const servicesEditable = fieldEditableInState(dossierState, {
      isService: true,
      baseEditable: editable,
    });
    // Hide the Transport & restauration tab from the nav when services are hidden.
    const visibleTabs = servicesHidden
      ? { ...tabsConfig, transport: false }
      : tabsConfig;

    // Dars-style child code = family code + next sibling index (shown so the
    // parent sees the same reference the school uses).
    const inscFamily = guardian?.family ?? null;
    const kidCode = inscFamily?.code
      ? buildKidCode(
          inscFamily.code,
          nextKidIndex(inscFamily.code, inscFamily.students),
        )
      : null;

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <PageHeader
          title={`${app.childLastName} ${app.childFirstName}`.trim()}
          description={`${kidCode ? `Code ${kidCode} · ` : ""}${app.cycle.label} · ${app.cycle.targetYearLabel}`}
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
            visibility={visibleTabs}
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
          visibility={visibleTabs}
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
            <DossierTabEleve
              applicationId={app.id}
              disabled={!otherEditable}
              config={eleveConfig}
              initial={eleveInitial}
              establishments={establishmentsForRenderer}
              renewal={isRenewal}
            />
          ) : null}

          {currentTab === "responsables" ? (
            <DossierResponsablesParents
              applicationId={app.id}
              disabled={!otherEditable}
              parentConfig={parentFormConfig}
              establishments={establishmentsForRenderer}
              initial={responsableRows}
            />
          ) : null}

          {currentTab === "responsables" ? (
            <ResponsableFooter
              applicationId={app.id}
              disabled={!otherEditable}
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
            const str = (v: unknown) => (typeof v === "string" ? v : "");
            const foyerInitial: Record<string, string> = {
              foyer_caza: fam?.addressCity ?? "",
              foyer_village: fam?.addressHood ?? "",
              foyer_street: fam?.addressStreet ?? "",
              foyer_building: str(foyerExtras.building),
              foyer_floor: str(foyerExtras.floor),
              foyer_details: str(foyerExtras.details),
              foyer_notes: str(foyerExtras.notes),
              foyer_siblings: JSON.stringify(
                app.siblings.map((s) => ({
                  firstName: s.firstName,
                  birthYear: s.birthYear != null ? String(s.birthYear) : "",
                  className: s.className ?? "",
                  schoolName: s.schoolName ?? "",
                })),
              ),
            };
            return (
              <DossierTabFoyer
                applicationId={app.id}
                config={foyerConfig}
                initial={foyerInitial}
                disabled={!otherEditable}
                renewal={isRenewal}
              />
            );
          })() : null}

          {currentTab === "scolarite" && !isRenewal ? (() => {
            const dossier =
              app.dossierAnswers &&
              typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            // Load adapter: canonical nested stores → flat config answers.
            const scolariteInitial: Record<string, string> = {
              ...scolariteAnswers(
                parseScolarite(dossier.scolarite),
                parsePedagogique(dossier.pedagogique),
              ),
            };
            // Prefill the entry-date default (was a prop on the old tab).
            if (!scolariteInitial[SCOLARITE_IDS.entryDate]) {
              scolariteInitial[SCOLARITE_IDS.entryDate] = app.cycle
                .schoolStartDate
                ? app.cycle.schoolStartDate.toISOString().slice(0, 10)
                : "";
            }
            return (
              <DossierTabScolarite
                applicationId={app.id}
                config={scolariteConfig}
                initial={scolariteInitial}
                initialEstablishmentId={app.establishmentId ?? ""}
                initialNiveau={app.niveau ?? ""}
                establishments={establishmentsForRenderer}
                disabled={!otherEditable}
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
            const fam = guardian?.family;
            return (
              <DossierTabAutorisations
                applicationId={app.id}
                disabled={!otherEditable}
                config={autorisationsConfig}
                initial={{
                  auth_site: boolYn(fam?.imageRightsSite),
                  auth_livre: boolYn(fam?.imageRightsBook),
                  auth_reseaux: boolYn(fam?.imageRightsSocial),
                  auth_radio: boolYn(fam?.imageRightsRadio),
                  quitter_seul: boolYn(
                    typeof autz.quitterSeul === "boolean" ? autz.quitterSeul : null,
                  ),
                }}
              />
            );
          })() : null}

          {currentTab === "transport" && !servicesHidden ? (() => {
            const dossier =
              app.dossierAnswers &&
              typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            // Prefill: new dossiers store the Dars-key Services shape directly;
            // legacy dossiers store TransportData → convert via the inverse map.
            const stored = dossier.transport;
            const isServiceShape =
              !!stored &&
              typeof stored === "object" &&
              ("transport_aller" in stored ||
                "transport_retour" in stored ||
                "collations" in stored ||
                "autocar" in stored);
            const svc = isServiceShape
              ? (stored as Record<string, string>)
              : serviceAnswersFromTransport(parseTransport(stored));
            const transportInitial: Record<string, string> = {};
            for (const f of transportConfig.fields) {
              const v = svc[f.key];
              if (typeof v === "string") transportInitial[f.id] = v;
            }
            return (
              <DossierTabTransport
                applicationId={app.id}
                config={transportConfig}
                initial={transportInitial}
                establishments={establishmentsForRenderer}
                disabled={!servicesEditable}
                renewal={isRenewal}
              />
            );
          })() : null}

          {currentTab === "contacts" ? (() => {
            // Load adapter: ApplicationContact rows → the two repeaters' JSON.
            const toRow = (c: (typeof app.contacts)[number]) => ({
              relation: c.relation ?? "",
              lastName: c.lastName ?? "",
              firstName: c.firstName ?? "",
              phoneMobile: c.phoneMobile ?? "",
              phoneHome: c.phoneHome ?? "",
            });
            const contactsInitial: Record<string, string> = {
              contacts_urgence: JSON.stringify(
                app.contacts.filter((c) => c.kind === "URGENCE").map(toRow),
              ),
              contacts_pickup: JSON.stringify(
                app.contacts.filter((c) => c.kind === "PICKUP").map(toRow),
              ),
            };
            return (
              <DossierTabContacts
                applicationId={app.id}
                config={contactsConfig}
                initial={contactsInitial}
                disabled={!otherEditable}
                renewal={isRenewal}
              />
            );
          })() : null}

          {currentTab === "sante" ? (() => {
            const dossier =
              app.dossierAnswers && typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            return (
              <DossierTabSante
                applicationId={app.id}
                config={santeConfig}
                initial={santeAnswers(parseSante(dossier.sante))}
                disabled={!otherEditable}
                renewal={isRenewal}
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
                config={financeConfig}
                initial={financeAnswers(parseFinance(dossier.finance))}
                disabled={!otherEditable}
                renewal={isRenewal}
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
                disabled={!otherEditable}
                acknowledged={validation.acknowledged === true}
                documentsListMarkdown=""
              />
            );
          })() : null}

          {/* Justificatifs tab still falls through to the placeholder
              for now — Phase 5 will hook it up to the existing
              ApplicationDocument upload flow. */}
          {currentTab === "justificatifs" ? (() => {
            const dossier =
              app.dossierAnswers && typeof app.dossierAnswers === "object"
                ? (app.dossierAnswers as Record<string, unknown>)
                : {};
            const justif =
              dossier.justificatifs && typeof dossier.justificatifs === "object"
                ? (dossier.justificatifs as Record<string, unknown>)
                : {};
            const justificatifsInitial: Record<string, string> = {};
            for (const f of justificatifsConfig.fields) {
              const v = justif[f.key];
              if (typeof v === "string") justificatifsInitial[f.id] = v;
            }
            return (
              <DossierTabJustificatifs
                applicationId={app.id}
                config={justificatifsConfig}
                initial={justificatifsInitial}
                disabled={!otherEditable}
                renewal={isRenewal}
              />
            );
          })() : null}
        </div>
        </TenantConfigProvider>

        <DossierBottomBar
          baseHref={baseHref}
          current={currentTab}
          visibility={visibleTabs}
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
