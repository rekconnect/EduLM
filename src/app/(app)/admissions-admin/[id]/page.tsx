import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Download,
  FileText,
  RefreshCw,
  Sparkles,
  Users,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { parseFieldConfig } from "@/lib/admission-fields";
import { parseEntityFieldsConfig } from "@/lib/entity-fields";
import {
  parseScolarite,
  parseTransport,
  parseSante,
  parseFinance,
  type FoyerData,
} from "@/lib/dossier-content";
import { classifyNiveau, parsePedagogique } from "@/lib/pedagogique";
import {
  DOSSIER_TABS,
  parseTabsCompleted,
  parseTabsConfig,
  type DossierTab,
} from "@/lib/dossier-tabs";
import { DossierTabStrip } from "@/components/dossier/tab-strip";
import { getSignedDownloadUrl } from "@/lib/storage";
import { AppStatusBadge } from "@/app/(app)/parent/applications/_status-badge";
import { DecideForm } from "./_decide";

/** Resolve the active tab from a ?tab= query param. Falls back to Élève. */
function parseTab(raw: string | undefined): DossierTab {
  if (raw && (DOSSIER_TABS as readonly string[]).includes(raw)) {
    return raw as DossierTab;
  }
  return "eleve";
}

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

// FR labels for the 13 RESPONSABLE_RELATIONS keys. Mirrors the parent
// side's responsable.relations.{key} i18n entries; inlined here so the
// admin page stays self-contained.
const RESPONSABLE_RELATION_LABELS: Record<string, string> = {
  pere: "Père",
  mere: "Mère",
  beau_pere: "Beau-père",
  belle_mere: "Belle-mère",
  grand_pere: "Grand-père",
  grand_mere: "Grand-mère",
  frere: "Frère",
  soeur: "Sœur",
  oncle: "Oncle",
  tante: "Tante",
  cousin: "Cousin / Cousine",
  tuteur: "Tuteur",
  non_defini: "Non défini",
};

// ──────────────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[color:var(--color-border-subtle)] py-2.5 last:border-0">
      <dt className="text-sm text-[color:var(--color-foreground-muted)]">
        {label}
      </dt>
      <dd className="col-span-2 text-sm text-[color:var(--color-foreground)] whitespace-pre-wrap break-words">
        {value || "—"}
      </dd>
    </div>
  );
}

/** True/false/null → localised string. Defaults to em-dash for null/undefined. */
function yn(v: boolean | null | undefined): string {
  if (v === true) return "Oui";
  if (v === false) return "Non";
  return "—";
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)] px-3 py-2.5 text-sm text-[color:var(--color-warning-soft-fg)]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Sub-heading inside a card, separating logical groups in the same card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)] first:mt-0">
      {children}
    </h3>
  );
}

/**
 * Render a card only when at least one of its rows has a value. Avoids
 * spamming the admin with empty sections for tabs the tenant hides
 * (Santé / Finance default off on Montaigne, etc.).
 */
function nonEmpty(values: Array<string | boolean | null | undefined>): boolean {
  return values.some(
    (v) =>
      v === true ||
      v === false ||
      (typeof v === "string" && v.trim().length > 0),
  );
}

// ──────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────

export default async function AdmissionsAdminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const currentTab = parseTab(tab);
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const app = await db.application.findUnique({
      where: { id },
      include: {
        cycle: {
          select: { label: true, targetYearLabel: true, fieldConfig: true },
        },
        establishment: { select: { name: true } },
        responsables: {
          orderBy: { order: "asc" },
          select: { id: true, kind: true, firstName: true, lastName: true, customAnswers: true },
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
        submittedBy: {
          select: {
            email: true,
            name: true,
            guardianProfile: {
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

    // Tenant fetch goes through unscopedDb — the auto-scoping extension
    // doesn't apply a tenantId filter to Tenant itself (Tenant IS the
    // tenancy root). Matches the pattern in the parent dossier shell.
    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: {
        parentFieldsConfig: true,
        inscriptionTabsConfig: true,
      },
    });
    const tabsConfig = parseTabsConfig(tenant?.inscriptionTabsConfig);
    const tabsCompleted = parseTabsCompleted(app.tabsCompleted);
    const parentFieldsConfig = parseEntityFieldsConfig(
      tenant?.parentFieldsConfig,
    );

    const existingChildren =
      app.submittedBy.guardianProfile?.childLinks ?? [];
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

    const finalized = ["ACCEPTED", "DECLINED", "WAITLISTED"].includes(
      app.status,
    );

    // ─── Parse all the dossierAnswers sub-blobs in one place ─────────
    const dossierRaw =
      app.dossierAnswers && typeof app.dossierAnswers === "object"
        ? (app.dossierAnswers as Record<string, unknown>)
        : {};
    const foyerExtras =
      dossierRaw.foyer && typeof dossierRaw.foyer === "object"
        ? (dossierRaw.foyer as Record<string, unknown>)
        : {};
    const scolarite = parseScolarite(dossierRaw.scolarite);
    const pedagogique = parsePedagogique(dossierRaw.pedagogique);
    const transport = parseTransport(dossierRaw.transport);
    const sante = parseSante(dossierRaw.sante);
    const finance = parseFinance(dossierRaw.finance);
    const validationRaw =
      dossierRaw.validation && typeof dossierRaw.validation === "object"
        ? (dossierRaw.validation as Record<string, unknown>)
        : {};
    const validationAck = validationRaw.acknowledged === true;
    const autorisationsRaw =
      dossierRaw.autorisations && typeof dossierRaw.autorisations === "object"
        ? (dossierRaw.autorisations as Record<string, unknown>)
        : {};
    const quitterSeul = autorisationsRaw.quitterSeul === true;

    // Each Père/Mère is stored on its own ApplicationResponsable.customAnswers
    // row (the two-responsable editor). Coerce each into a flat string map for
    // the renderer. The legacy Application.parentAnswers blob is no longer the
    // source — fall back to it only when there are no responsable rows (old
    // dossiers) so historic applications still display.
    const coerce = (raw: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof v === "string") out[k] = v;
          else if (Array.isArray(v))
            out[k] = v.filter((x) => typeof x === "string").join(", ");
          else if (v != null) out[k] = String(v);
        }
      }
      return out;
    };
    const RESP_KIND_LABEL: Record<string, string> = {
      PERE: "Père",
      MERE: "Mère",
      TUTEUR: "Tuteur",
      AUTRE: "Autre responsable",
    };
    const responsableCards =
      app.responsables.length > 0
        ? app.responsables.map((r) => ({
            id: r.id,
            title: RESP_KIND_LABEL[r.kind] ?? "Responsable",
            answers: coerce(r.customAnswers),
          }))
        : app.parentAnswers && Object.keys(app.parentAnswers).length > 0
          ? [{ id: "legacy", title: "Responsable", answers: coerce(app.parentAnswers) }]
          : [];

    // Foyer data — address lives on Family (linked via Guardian), the
    // sub-fields (building/floor/details/notes) live in dossierAnswers.
    const family = app.submittedBy.guardianProfile?.family ?? null;
    const foyer: FoyerData = {
      addressCaza: family?.addressCity ?? "",
      addressVillage: family?.addressHood ?? "",
      addressStreet: family?.addressStreet ?? "",
      addressBuilding:
        typeof foyerExtras.building === "string" ? foyerExtras.building : "",
      addressFloor:
        typeof foyerExtras.floor === "string" ? foyerExtras.floor : "",
      addressDetails:
        typeof foyerExtras.details === "string" ? foyerExtras.details : "",
      addressNotes:
        typeof foyerExtras.notes === "string" ? foyerExtras.notes : "",
      imageRightsSite: family?.imageRightsSite ?? null,
      imageRightsBook: family?.imageRightsBook ?? null,
      imageRightsSocial: family?.imageRightsSocial ?? null,
      imageRightsRadio: family?.imageRightsRadio ?? null,
    };

    const niveauGroup = classifyNiveau(app.niveau);
    // Student dossier answers (Dars field ids). The migrated Élève tab writes
    // the combined Arabic name here as nom_prenom_ar; fall back to the legacy
    // split columns for dossiers created before the migration.
    const studentAns = coerce(app.studentAnswers);

    const urgenceContacts = app.contacts.filter((c) => c.kind === "URGENCE");
    const pickupContacts = app.contacts.filter((c) => c.kind === "PICKUP");

    return (
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

        {/* Status + family + reviewer row */}
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

        {/* Review / decide form */}
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

        {/* ── Tab strip — mirrors the parent's 10-tab dossier so admin
            navigates the same shape they're reviewing. baseHref points
            back at this admission detail; the tab strip's links append
            ?tab=foo. Visibility + completion badges come from the same
            tenant config + Application.tabsCompleted the parent sees. */}
        <DossierTabStrip
          baseHref={`/admissions-admin/${app.id}`}
          current={currentTab}
          visibility={tabsConfig}
          completed={tabsCompleted}
        />

        {/* ── Élève (État civil + Passeport) ─────────────────────── */}
        {currentTab === "eleve" ? (
        <Card>
          <CardHeader title="Élève" />
          <CardBody>
            <SectionLabel>État civil</SectionLabel>
            <dl>
              <Row label="Nom" value={app.childLastName} />
              <Row label="Prénom" value={app.childFirstName} />
              <Row
                label="الاسم الكامل (nom prénom AR)"
                value={
                  studentAns.nom_prenom_ar ||
                  [app.childLastNameAr, app.childFirstNameAr].filter(Boolean).join(" ")
                }
              />
              <Row
                label="Date de naissance"
                value={
                  app.childDob
                    ? app.childDob.toISOString().slice(0, 10)
                    : ""
                }
              />
              <Row
                label="Sexe"
                value={
                  app.childGender
                    ? t(GENDER_KEY[app.childGender] ?? "genderOther")
                    : ""
                }
              />
              <Row
                label="Ville de naissance"
                value={app.childPlaceOfBirth ?? ""}
              />
              <Row
                label="مكان الولادة (ville AR)"
                value={app.childPlaceOfBirthAr ?? ""}
              />
              <Row
                label="Pays de naissance"
                value={app.childBirthCountry ?? ""}
              />
            </dl>
            <SectionLabel>Passeport / Carte d&apos;identité</SectionLabel>
            <dl>
              <Row
                label="Nationalité libanaise"
                value={yn(app.childIsLebanese)}
              />
              {app.childIsLebanese === true ? (
                <Row
                  label="N° passeport / CI libanaise"
                  value={app.childPassportLebanese ?? ""}
                />
              ) : null}
              <Row label="Nationalité 1" value={app.childNationality ?? ""} />
              <Row label="Nationalité 2" value={app.childNationality2 ?? ""} />
            </dl>
          </CardBody>
        </Card>

        ) : null}

        {/* ── Responsables — one card per Père/Mère, fields from each
            responsable's customAnswers (the two-responsable editor). ── */}
        {currentTab === "responsables" ? (
        <>
          {responsableCards.length === 0 ? (
            <Card>
              <CardHeader title="Responsables" />
              <CardBody>
                <p className="text-sm text-[color:var(--color-foreground-muted)]">
                  Aucun responsable saisi.
                </p>
              </CardBody>
            </Card>
          ) : (
            responsableCards.map((resp) => {
              const fullName = [resp.answers.prenom, resp.answers.nom]
                .filter(Boolean)
                .join(" ");
              return (
                <Card key={resp.id}>
                  <CardHeader title={resp.title} description={fullName || undefined} />
                  <CardBody>
                    <dl>
                      {parentFieldsConfig.fields
                        .filter((f) => f.active !== false)
                        .map((f) => (
                          <Row
                            key={f.id}
                            label={f.label}
                            value={resp.answers[f.id] ?? ""}
                          />
                        ))}
                    </dl>
                  </CardBody>
                </Card>
              );
            })
          )}
          <Card>
            <CardHeader title="Famille" />
            <CardBody>
              <dl>
                <Row label="Famille monoparentale" value={yn(app.monoParental)} />
              </dl>
            </CardBody>
          </Card>
        </>
        ) : null}

        {/* ── Foyer (address + siblings + image rights) ───────────── */}
        {currentTab === "foyer" ? (
          <Card>
            <CardHeader title="Foyer" />
            <CardBody>
              <SectionLabel>Adresse du foyer</SectionLabel>
              <dl>
                <Row label="Caza" value={foyer.addressCaza} />
                <Row label="Village" value={foyer.addressVillage} />
                <Row label="Rue" value={foyer.addressStreet} />
                <Row label="Immeuble" value={foyer.addressBuilding} />
                <Row label="Étage" value={foyer.addressFloor} />
                <Row label="Détails" value={foyer.addressDetails} />
                <Row label="Remarques" value={foyer.addressNotes} />
              </dl>

              {app.siblings.length > 0 ? (
                <>
                  <SectionLabel>Frères et sœurs (autres écoles)</SectionLabel>
                  <ul className="space-y-1 text-sm">
                    {app.siblings.map((s, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-[color:var(--color-border-subtle)] py-2 last:border-0"
                      >
                        <span className="font-medium text-[color:var(--color-foreground)]">
                          {s.firstName || "—"}
                        </span>
                        {s.birthYear != null ? (
                          <span className="text-[color:var(--color-foreground-muted)]">
                            ({s.birthYear})
                          </span>
                        ) : null}
                        {s.className ? (
                          <span className="text-[color:var(--color-foreground-muted)]">
                            · {s.className}
                          </span>
                        ) : null}
                        {s.schoolName ? (
                          <span className="text-[color:var(--color-foreground-muted)]">
                            · {s.schoolName}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {/* ── Autorisations (image rights + quitter seul) — mirrors the
            parent dossier's Autorisations tab. ──────────────────────── */}
        {currentTab === "autorisations" ? (
          <Card>
            <CardHeader title="Autorisations" />
            <CardBody>
              <SectionLabel>Autorisation de prise de vue</SectionLabel>
              <dl>
                <Row label="Site internet" value={yn(foyer.imageRightsSite)} />
                <Row label="Livre souvenir" value={yn(foyer.imageRightsBook)} />
                <Row
                  label="Réseaux sociaux"
                  value={yn(foyer.imageRightsSocial)}
                />
                <Row label="Web Radio" value={yn(foyer.imageRightsRadio)} />
              </dl>
              <SectionLabel>Sortie de l&apos;établissement</SectionLabel>
              <dl>
                <Row
                  label="Autorisé(e) à quitter seul(e)"
                  value={yn(quitterSeul)}
                />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {/* ── Scolarité (wishlist + previous + history + EBEP + bilans + dispense)
            + Pédagogique sub-cards. They live in the same tab on the
            parent side so we keep that grouping for admin too. */}
        {currentTab === "scolarite" ? (
        <>
        <Card>
          <CardHeader title="Scolarité" />
          <CardBody>
            <SectionLabel>Scolarité souhaitée</SectionLabel>
            <dl>
              <Row
                label="Établissement"
                value={app.establishment?.name ?? ""}
              />
              <Row label="Niveau" value={app.niveau ?? app.requestedLevel ?? ""} />
              <Row
                label="Date d'entrée souhaitée"
                value={scolarite.entryDate}
              />
            </dl>

            {nonEmpty([
              scolarite.previousSchool,
              scolarite.previousClass,
              scolarite.previousNetwork,
              scolarite.attendedMlfBefore,
            ]) ? (
              <>
                <SectionLabel>Établissement précédent</SectionLabel>
                <dl>
                  <Row
                    label="Établissement fréquenté"
                    value={scolarite.previousSchool}
                  />
                  <Row
                    label="Classe fréquentée"
                    value={scolarite.previousClass}
                  />
                  <Row label="Réseau" value={scolarite.previousNetwork} />
                  <Row
                    label="Déjà scolarisé dans un établissement MLF"
                    value={yn(scolarite.attendedMlfBefore)}
                  />
                </dl>
              </>
            ) : null}

            {scolarite.history.length > 0 ? (
              <>
                <SectionLabel>
                  Scolarité antérieure (3 dernières années)
                </SectionLabel>
                <ul className="space-y-1 text-sm">
                  {scolarite.history.map((h, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-2 border-b border-[color:var(--color-border-subtle)] py-2 last:border-0"
                    >
                      <span className="font-medium text-[color:var(--color-foreground)]">
                        {h.year || "—"}
                      </span>
                      {h.className ? (
                        <span className="text-[color:var(--color-foreground-muted)]">
                          · {h.className}
                        </span>
                      ) : null}
                      {h.school ? (
                        <span className="text-[color:var(--color-foreground-muted)]">
                          · {h.school}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {scolarite.ebepPrevious !== null || scolarite.ebepCurrent !== null ? (
              <>
                <SectionLabel>EBEP — Aménagements</SectionLabel>
                <dl>
                  <Row
                    label="Précédent établissement"
                    value={yn(scolarite.ebepPrevious)}
                  />
                  {scolarite.ebepPrevious === true ? (
                    <Row
                      label="Aménagements précédents"
                      value={Object.entries(scolarite.ebepPreviousFlags)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .join(", ")}
                    />
                  ) : null}
                  <Row
                    label="Notre établissement"
                    value={yn(scolarite.ebepCurrent)}
                  />
                  {scolarite.ebepCurrent === true ? (
                    <Row
                      label="Aménagements demandés"
                      value={Object.entries(scolarite.ebepCurrentFlags)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .join(", ")}
                    />
                  ) : null}
                </dl>
              </>
            ) : null}

            {Object.values(scolarite.bilansRealises).some(Boolean) ? (
              <>
                <SectionLabel>Bilans déjà réalisés</SectionLabel>
                <dl>
                  <Row
                    label="Orthophonique"
                    value={yn(scolarite.bilansRealises.orthophonique)}
                  />
                  <Row
                    label="Psychologique"
                    value={yn(scolarite.bilansRealises.psychologique)}
                  />
                  <Row
                    label="Psychomoteur"
                    value={yn(scolarite.bilansRealises.psychomoteur)}
                  />
                  <Row
                    label="Psycho-pédiatrique"
                    value={yn(scolarite.bilansRealises.psychoPediatrique)}
                  />
                </dl>
              </>
            ) : null}

            {scolarite.dispenseLibanais ? (
              <>
                <SectionLabel>Dispense des examens libanais</SectionLabel>
                <dl>
                  <Row
                    label="Programme libanais"
                    value={
                      scolarite.dispenseLibanais === "oui"
                        ? "Dispensé"
                        : "Non dispensé"
                    }
                  />
                </dl>
              </>
            ) : null}
          </CardBody>
        </Card>

        {/* ── Pédagogique (niveau-conditional) ────────────────────── */}
        {niveauGroup === "ce2_3eme" && pedagogique.ce2_3eme.arabe ? (
          <Card>
            <CardHeader title="Renseignements pédagogiques" />
            <CardBody>
              <dl>
                <Row
                  label="Programme d'arabe"
                  value={
                    pedagogique.ce2_3eme.arabe === "ALE"
                      ? "ALE (langue étrangère)"
                      : "ALM (langue maternelle)"
                  }
                />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {niveauGroup === "seconde" ? (
          <Card>
            <CardHeader title="Renseignements pédagogiques (2nde)" />
            <CardBody>
              <dl>
                <Row label="LVA" value={pedagogique.seconde.lva} />
                <Row label="LVB" value={pedagogique.seconde.lvb} />
                <Row
                  label="LVC"
                  value={pedagogique.seconde.lvc.join(", ")}
                />
                <Row
                  label="Arts plastiques"
                  value={yn(pedagogique.seconde.artsPlastiques)}
                />
                <Row
                  label="Sciences de l'Ingénieur (SI-CIT)"
                  value={yn(pedagogique.seconde.siCit)}
                />
                <Row
                  label="Section internationale (BFI)"
                  value={yn(pedagogique.seconde.sectionInternationale)}
                />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {niveauGroup === "premiere" ? (
          <Card>
            <CardHeader title="Renseignements pédagogiques (1ère)" />
            <CardBody>
              <dl>
                <Row
                  label="Spécialités (3 choix)"
                  value={pedagogique.premiere.specialites.join(", ")}
                />
                <Row label="LVA" value={pedagogique.premiere.lva} />
                <Row label="LVB" value={pedagogique.premiere.lvb} />
                <Row
                  label="LVC"
                  value={pedagogique.premiere.lvc.join(", ")}
                />
                <Row
                  label="Arts plastiques"
                  value={yn(pedagogique.premiere.artsPlastiques)}
                />
                <Row label="BFI" value={yn(pedagogique.premiere.bfi)} />
                <Row
                  label="Complément libanais — Physique"
                  value={yn(pedagogique.premiere.complementLibanaisPhysique)}
                />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {niveauGroup === "terminale" ? (
          <Card>
            <CardHeader title="Renseignements pédagogiques (Terminale)" />
            <CardBody>
              <dl>
                <Row
                  label="Spécialités (2 choix)"
                  value={pedagogique.terminale.specialites.join(", ")}
                />
                <Row label="LVA" value={pedagogique.terminale.lva} />
                <Row label="LVB" value={pedagogique.terminale.lvb} />
                <Row
                  label="LVC"
                  value={pedagogique.terminale.lvc.join(", ")}
                />
                <Row
                  label="Arts plastiques"
                  value={yn(pedagogique.terminale.artsPlastiques)}
                />
                <Row
                  label="Mathématiques"
                  value={
                    pedagogique.terminale.mathsExpertes
                      ? "Maths expertes"
                      : pedagogique.terminale.mathsComplementaire
                        ? "Maths complémentaires"
                        : "Aucun"
                  }
                />
                <Row
                  label="Complément libanais — Physique + SVT"
                  value={yn(pedagogique.terminale.complementLibanaisPhysiqueSvt)}
                />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        </>
        ) : null}

        {/* ── Transport & restauration ─────────────────────────────── */}
        {currentTab === "transport" ? (
          <Card>
            <CardHeader title="Transport & restauration" />
            <CardBody>
              <SectionLabel>Transport</SectionLabel>
              <dl>
                <Row
                  label="Aller"
                  value={
                    transport.modeAller === "bus"
                      ? "Bus de l'école"
                      : transport.modeAller === "parents"
                        ? "Avec les parents"
                        : ""
                  }
                />
                <Row
                  label="Retour"
                  value={
                    transport.modeRetour === "bus"
                      ? "Bus de l'école"
                      : transport.modeRetour === "parents"
                        ? "Avec les parents"
                        : ""
                  }
                />
              </dl>

              {transport.hasAlternateAddress ? (
                <>
                  <SectionLabel>Adresse alternative de récupération</SectionLabel>
                  <dl>
                    <Row label="Caza" value={transport.altCaza} />
                    <Row label="Village" value={transport.altVillage} />
                    <Row label="Rue" value={transport.altStreet} />
                    <Row label="Immeuble" value={transport.altBuilding} />
                    <Row label="Étage" value={transport.altFloor} />
                    <Row label="Détails" value={transport.altDetails} />
                    <Row label="Remarques" value={transport.altNotes} />
                  </dl>
                </>
              ) : null}

              <SectionLabel>Restauration</SectionLabel>
              <dl>
                <Row label="Collation" value={yn(transport.collation)} />
                <Row label="Cantine" value={yn(transport.cantine)} />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {/* ── Autres contacts (urgence + pickup) ───────────────────── */}
        {currentTab === "contacts" ? (
          <Card>
            <CardHeader title="Autres contacts" />
            <CardBody>
              {urgenceContacts.length > 0 ? (
                <>
                  <SectionLabel>Contact en cas d&apos;urgence</SectionLabel>
                  <ul className="space-y-2 text-sm">
                    {urgenceContacts.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2"
                      >
                        <p className="font-medium text-[color:var(--color-foreground)]">
                          {c.lastName} {c.firstName}
                          {c.relation ? (
                            <span className="ms-2 text-xs font-normal text-[color:var(--color-foreground-muted)]">
                              ({RESPONSABLE_RELATION_LABELS[c.relation] ??
                                c.relation})
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                          {c.phoneMobile ? `Mobile : ${c.phoneMobile}` : null}
                          {c.phoneMobile && c.phoneHome ? " · " : null}
                          {c.phoneHome ? `Domicile : ${c.phoneHome}` : null}
                          {!c.phoneMobile && !c.phoneHome ? "—" : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {pickupContacts.length > 0 ? (
                <>
                  <SectionLabel>
                    Personnes autorisées à récupérer l&apos;enfant
                  </SectionLabel>
                  <ul className="space-y-2 text-sm">
                    {pickupContacts.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2"
                      >
                        <p className="font-medium text-[color:var(--color-foreground)]">
                          {c.lastName} {c.firstName}
                          {c.relation ? (
                            <span className="ms-2 text-xs font-normal text-[color:var(--color-foreground-muted)]">
                              ({RESPONSABLE_RELATION_LABELS[c.relation] ??
                                c.relation})
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                          {c.phoneMobile ? `Mobile : ${c.phoneMobile}` : null}
                          {c.phoneMobile && c.phoneHome ? " · " : null}
                          {c.phoneHome ? `Domicile : ${c.phoneHome}` : null}
                          {!c.phoneMobile && !c.phoneHome ? "—" : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {/* ── Santé ────────────────────────────────────────────────── */}
        {currentTab === "sante" ? (
          <Card>
            <CardHeader title="Santé" />
            <CardBody>
              <dl>
                <Row label="Allergies" value={sante.allergies} />
                <Row label="Traitement(s) en cours" value={sante.traitement} />
                <Row label="Médecin traitant" value={sante.doctorName} />
                <Row label="Téléphone du médecin" value={sante.doctorPhone} />
                <Row
                  label="Vaccinations à jour"
                  value={yn(sante.vaccinationsUpToDate)}
                />
                <Row label="PAI" value={yn(sante.hasPai)} />
                {sante.hasPai === true ? (
                  <Row label="Détails du PAI" value={sante.paiDetails} />
                ) : null}
                <Row label="Régime alimentaire" value={sante.diet} />
                <Row label="Notes" value={sante.notes} />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {/* ── Finance ──────────────────────────────────────────────── */}
        {currentTab === "finance" ? (
          <Card>
            <CardHeader title="Finance" />
            <CardBody>
              <SectionLabel>Acknowledgements</SectionLabel>
              <dl>
                <Row
                  label="Règlement intérieur lu et approuvé"
                  value={yn(finance.acknowledgedReglementInterieur)}
                />
                <Row
                  label="Règlement financier lu et approuvé"
                  value={yn(finance.acknowledgedReglementFinancier)}
                />
                <Row
                  label="Droits d'entrée MLF acceptés"
                  value={yn(finance.acknowledgedDroitsEntreeMlf)}
                />
              </dl>

              <SectionLabel>Comité des parents</SectionLabel>
              <dl>
                <Row label="Adhésion" value={yn(finance.comiteParents)} />
              </dl>

              <SectionLabel>Caisse de solidarité</SectionLabel>
              <dl>
                <Row
                  label="Montant LBP"
                  value={
                    finance.caisseLbp === "autre"
                      ? finance.caisseLbpAutreAmount ||
                        "Autre montant (non saisi)"
                      : finance.caisseLbp === "none"
                        ? "Ne souhaite pas contribuer"
                        : finance.caisseLbp
                  }
                />
                <Row
                  label="Montant USD"
                  value={
                    finance.caisseUsd === "autre"
                      ? finance.caisseUsdAutreAmount ||
                        "Autre montant (non saisi)"
                      : finance.caisseUsd === "none"
                        ? "Ne souhaite pas contribuer"
                        : finance.caisseUsd
                  }
                />
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {/* ── Validation (procedure ack) ────────────────────────────── */}
        {currentTab === "validation" ? (
        <Card>
          <CardHeader title="Validation" />
          <CardBody>
            <dl>
              <Row
                label="Procédure d'inscription lue et approuvée"
                value={yn(validationAck)}
              />
            </dl>
          </CardBody>
        </Card>
        ) : null}

        {/* ── Justificatifs — custom cycle questions + required docs.
            Both come from the cycle-level fieldConfig (set by admin in
            the cycle editor), not the parent's per-dossier inputs.
            Folded into the Justificatifs tab so admin sees all
            doc-flavoured content in one place. */}
        {currentTab === "justificatifs" ? (
        <>
        {(() => {
          const cfg = parseFieldConfig(app.cycle.fieldConfig);
          const questions = cfg.customQuestions ?? [];
          if (questions.length === 0) return null;
          const answers = new Map(
            app.answers.map((a) => [a.questionId, a.value]),
          );
          return (
            <Card>
              <CardHeader title={t("customQuestionsTitle")} />
              <CardBody>
                <dl>
                  {questions.map((q) => {
                    const raw = answers.get(q.id) ?? "";
                    const display =
                      q.type === "yes_no"
                        ? raw === "yes"
                          ? "Oui"
                          : raw === "no"
                            ? "Non"
                            : ""
                        : raw;
                    return <Row key={q.id} label={q.label} value={display} />;
                  })}
                </dl>
              </CardBody>
            </Card>
          );
        })()}

        {/* ── Required documents (kept as-is) ─────────────────────── */}
        {await (async () => {
          const cfg = parseFieldConfig(app.cycle.fieldConfig);
          const requirements = cfg.requiredDocuments ?? [];
          if (requirements.length === 0) return null;
          const uploadsByReq = new Map(
            app.documents.map((d) => [d.requirementId, d]),
          );
          const signed = await Promise.all(
            requirements.map(async (req) => {
              const doc = uploadsByReq.get(req.id);
              if (!doc) return { req, doc: null, url: null };
              const url = await getSignedDownloadUrl(doc.storagePath);
              return { req, doc, url };
            }),
          );
          return (
            <Card>
              <CardHeader title={t("requiredDocsTitle")} />
              <CardBody>
                <ul className="space-y-2">
                  {signed.map(({ req, doc, url }) => (
                    <li
                      key={req.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-sm"
                    >
                      <FileText
                        className={cn(
                          "size-4 shrink-0",
                          doc
                            ? "text-[color:var(--color-success)]"
                            : "text-[color:var(--color-foreground-subtle)]",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[color:var(--color-foreground)]">
                          {req.label}
                          {req.required ? (
                            <span className="ms-1 text-[color:var(--color-danger)]">
                              *
                            </span>
                          ) : null}
                        </p>
                        {doc ? (
                          <p className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                            {doc.filename}
                          </p>
                        ) : (
                          <p className="text-xs text-[color:var(--color-foreground-subtle)]">
                            {t("requiredDocsNotUploaded")}
                          </p>
                        )}
                      </div>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-foreground)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
                        >
                          <Download className="size-3" aria-hidden />
                          {t("requiredDocsDownload")}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })()}
        </>
        ) : null}
      </main>
    );
  });
}
