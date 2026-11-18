import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Pencil,
  ArrowLeft,
  User,
  Users,
  Home,
  IdCard,
  Phone,
  Briefcase,
  Baby,
  ClipboardList,
  KeyRound,
  Languages,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { splitLegacyName } from "@/lib/names";
import {
  isHouseholdCategory,
  storedAnswer,
  type FieldDef,
} from "@/lib/entity-fields";
import { isStaffDomainEmail, staffDomainsFor } from "@/lib/staff-identity";
import { EditTabs, type EditTab } from "@/components/fiche/edit-tabs";
import { listEstablishments, loadEntityFieldsConfig } from "../../../settings/_actions";
import { ParentCategoryForm } from "./_category-form";
import {
  toggleParentStatus,
  unlinkGuardianFromStudent,
  updateParent,
  updateParentIdentity,
} from "../_actions";
import { EditParentForm } from "./_edit-form";
import { ParentIdentityForm } from "./_identity-form";
import { ResetPasswordButton } from "./_reset-password";
import { FamilyFiche, type FicheGuardian, type FicheStudent } from "./_fiche";

const STATUS_KEY: Record<string, string> = {
  ACTIVE: "statusActive",
  INVITED: "statusInvited",
  DISABLED: "statusDisabled",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  INVITED:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DISABLED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
};

const RELATION_LABELS_FR: Record<string, string> = {
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

const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

type TabKey =
  | "compte"
  | "identite"
  | "contact"
  | "foyer"
  | "professionnel"
  | "enfants";

const TAB_DEFS: Array<{ key: TabKey; label: string; icon: typeof User }> = [
  { key: "compte", label: "Compte", icon: User },
  { key: "identite", label: "Identité", icon: IdCard },
  { key: "contact", label: "Contact", icon: Phone },
  { key: "foyer", label: "Foyer", icon: Home },
  { key: "professionnel", label: "Professionnel", icon: Briefcase },
  { key: "enfants", label: "Enfants", icon: Baby },
];

function parseTab(raw: string | undefined): TabKey {
  const valid: TabKey[] = [
    "compte",
    "identite",
    "contact",
    "foyer",
    "professionnel",
    "enfants",
  ];
  if (raw && (valid as string[]).includes(raw)) return raw as TabKey;
  return "compte";
}

function yn(v: boolean | null | undefined): string {
  return v === true ? "Oui" : v === false ? "Non" : "—";
}

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

export default async function ParentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; mode?: string }>;
}) {
  const { id } = await params;
  const { tab, mode } = await searchParams;
  const currentTab = parseTab(tab);
  const isEditMode = mode === "edit";

  const { user } = await requireModuleAccess("eleves", "read");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("parents");
    const tCommon = await getTranslations("common");

    const [parent, parentFieldsConfig, studentFieldsConfig, establishmentsRaw, latestApp] =
      await Promise.all([
        db.user.findUnique({
          where: { id },
          include: {
            guardianProfile: {
              include: {
                family: {
                  include: {
                    // Both parents of the family — drives the parallel
                    // père | mère columns on the fiche.
                    guardians: {
                      select: {
                        id: true,
                        userId: true,
                        relation: true,
                        phone: true,
                        nationality1: true,
                        nationality2: true,
                        user: {
                          select: {
                            firstName: true,
                            lastName: true,
                            name: true,
                            email: true,
                            staffRole: true,
                            customAnswers: true,
                          },
                        },
                      },
                    },
                    students: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        status: true,
                        customAnswers: true,
                        enrollments: {
                          select: {
                            class: { select: { name: true, level: true } },
                            academicYear: {
                              select: { label: true, isActive: true, startDate: true },
                            },
                          },
                          orderBy: { academicYear: { startDate: "desc" } },
                          take: 12,
                        },
                      },
                    },
                  },
                },
                childLinks: {
                  include: {
                    student: {
                      select: { id: true, firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
          },
        }),
        loadEntityFieldsConfig("parent"),
        loadEntityFieldsConfig("student"),
        listEstablishments(),
        db.application.findFirst({
          where: { submittedByUserId: id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            parentAnswers: true,
            submitterRelation: true,
            submitterIsLebanese: true,
            submitterPassportLebanese: true,
            submitterNationality: true,
            submitterNationality2: true,
            monoParental: true,
          },
        }),
      ]);
    if (!parent || parent.role !== "PARENT") notFound();
    // Double profil: a parent wearing a staff hat, or on a staff e-mail
    // domain, is a staff identity — managed by SCHOOL_ADMIN only. Same rule
    // as staffIdentityGuard, which every write of this page goes through, so
    // the page never offers a form whose save would be refused.
    const hat = await db.user.findFirst({ where: { id: parent.id }, select: { staffRole: true } });
    const staffDomains =
      user.role === "SCHOOL_ADMIN" ? [] : await staffDomainsFor(tenantId);
    const isLockedIdentity = (u: { staffRole: unknown; email: string }) =>
      user.role !== "SCHOOL_ADMIN" &&
      (u.staffRole != null || isStaffDomainEmail(u.email, staffDomains));
    const staffLocked = isLockedIdentity({
      staffRole: hat?.staffRole,
      email: parent.email,
    });

    // Levels feed the cascading establishment_with_niveau renderer in edit mode.
    const establishmentsForRenderer = establishmentsRaw
      .filter((e) => e.isActive)
      .map((e) => ({
        id: e.id,
        name: e.name,
        levels: Array.isArray(e.levels)
          ? (e.levels.filter((x) => typeof x === "string") as string[])
          : [],
      }));

    // Build the answer map: User.customAnswers + latest Application.parentAnswers
    // overlay (dossier wins on conflict).
    const initialAnswers: Record<string, string> = {};
    if (parent.customAnswers && typeof parent.customAnswers === "object") {
      for (const [k, v] of Object.entries(
        parent.customAnswers as Record<string, unknown>,
      )) {
        if (typeof v === "string") initialAnswers[k] = v;
        else if (v != null) initialAnswers[k] = String(v);
      }
    }
    if (latestApp?.parentAnswers && typeof latestApp.parentAnswers === "object") {
      for (const [k, v] of Object.entries(
        latestApp.parentAnswers as Record<string, unknown>,
      )) {
        if (typeof v === "string" && v.trim().length > 0) {
          initialAnswers[k] = v;
        } else if (Array.isArray(v)) {
          initialAnswers[k] = v.filter((x) => typeof x === "string").join(", ");
        } else if (v != null && typeof v !== "object") {
          initialAnswers[k] = String(v);
        }
      }
    }

    // Resolve userBoundTo + guardianBoundTo + familyBoundTo for read-only
    // preview rows. Bound fields mirror the canonical column (populated by
    // the Dars import) instead of the answers JSON.
    function resolveFieldValue(fieldId: string): string {
      const field = parentFieldsConfig.fields.find((f) => f.id === fieldId);
      if (!field) return "";
      if (field.userBoundTo) {
        const u = parent;
        if (field.userBoundTo === "firstName") return u!.firstName ?? "";
        if (field.userBoundTo === "lastName") return u!.lastName ?? "";
        if (field.userBoundTo === "name") return u!.name ?? "";
        if (field.userBoundTo === "email") return u!.email ?? "";
      }
      const g = parent?.guardianProfile;
      if (field.guardianBoundTo && g) {
        switch (field.guardianBoundTo) {
          case "phone":
            return g.phone ?? "";
          case "nationality1":
            return g.nationality1 ?? "";
          case "nationality2":
            return g.nationality2 ?? "";
          case "isLebanese":
            return g.isLebanese == null ? "" : g.isLebanese ? "Oui" : "Non";
          case "passportLebanese":
            return g.passportLebanese ?? "";
          case "relation":
            return g.relation ? (RELATION_LABELS_FR[g.relation] ?? g.relation) : "";
        }
      }
      const famRow = g?.family;
      if (field.familyBoundTo && famRow) {
        switch (field.familyBoundTo) {
          case "addressStreet":
            return famRow.addressStreet ?? "";
          case "addressHood":
            return famRow.addressHood ?? "";
          case "addressCity":
            return famRow.addressCity ?? "";
          case "addressCountry":
            return famRow.addressCountry ?? "";
          case "imageRightsSite":
            return famRow.imageRightsSite == null ? "" : famRow.imageRightsSite ? "Oui" : "Non";
          case "imageRightsBook":
            return famRow.imageRightsBook == null ? "" : famRow.imageRightsBook ? "Oui" : "Non";
          case "imageRightsSocial":
            return famRow.imageRightsSocial == null ? "" : famRow.imageRightsSocial ? "Oui" : "Non";
          case "imageRightsRadio":
            return famRow.imageRightsRadio == null ? "" : famRow.imageRightsRadio ? "Oui" : "Non";
        }
      }
      return initialAnswers[fieldId] ?? "";
    }

    // Group fields by category name (so the preview tabs can render the
    // tenant-configured custom fields under the right tab).
    const fieldsByCategory = new Map<string, typeof parentFieldsConfig.fields>();
    for (const f of parentFieldsConfig.fields) {
      if (f.active === false) continue;
      const cat = parentFieldsConfig.categories.find((c) => c.id === f.categoryId);
      const catName = cat?.name ?? "Autre";
      const bucket = fieldsByCategory.get(catName) ?? [];
      bucket.push(f);
      fieldsByCategory.set(catName, bucket);
    }

    const boundUpdate = updateParent.bind(null, id);
    const boundUpdateIdentity = updateParentIdentity.bind(null, id);
    const boundToggle = toggleParentStatus.bind(null, id);

    // Label resolver — use the tenant's custom-field label (set in
    // /settings → Forms) whenever a userBoundTo field maps to the
    // built-in column being rendered. Keeps labels consistent across
    // the parent dossier, admin admission view, settings, and here.
    function labelForBoundProp(
      prop: "firstName" | "lastName" | "email" | "name",
      fallback: string,
    ): string {
      const f = parentFieldsConfig.fields.find(
        (x) => x.userBoundTo === prop && x.active !== false,
      );
      return f?.label ?? fallback;
    }

    const fam = parent.guardianProfile?.family ?? null;
    const childLinks = parent.guardianProfile?.childLinks ?? [];

    // ── Shape the family fiche (père | mère columns + kids) ──
    const toAnswers = (ca: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      if (ca && typeof ca === "object") {
        for (const [k, v] of Object.entries(ca as Record<string, unknown>)) {
          if (typeof v === "string") out[k] = v;
          else if (v != null) out[k] = String(v);
        }
      }
      return out;
    };
    // The fiche reads answers by field KEY. Where a field's id differs from
    // its key (fields created in Settings) the id slot is the one the
    // inscription forms keep current: surface it under the key too.
    const byKey = (answers: Record<string, string>): Record<string, string> => {
      const out = { ...answers };
      for (const f of parentFieldsConfig.fields) {
        const underId = out[f.id];
        if (f.id !== f.key && underId !== undefined) out[f.key] = underId;
      }
      return out;
    };
    const relRank = (r: string) => (r === "pere" ? 0 : r === "mere" ? 1 : 2);
    const ficheGuardians: FicheGuardian[] = (fam?.guardians ?? [])
      .map((gg) => ({
        guardianId: gg.id,
        userId: gg.userId,
        relation: gg.relation ?? "",
        relationLabel: gg.relation
          ? (RELATION_LABELS_FR[gg.relation] ?? gg.relation)
          : "Responsable",
        firstName: gg.user.firstName ?? splitLegacyName(gg.user.name).firstName,
        lastName: gg.user.lastName ?? splitLegacyName(gg.user.name).lastName,
        email: gg.user.email,
        phone: gg.phone,
        nationality1: gg.nationality1,
        nationality2: gg.nationality2,
        answers: byKey(toAnswers(gg.user.customAnswers)),
      }))
      // Père first, then mère. The id breaks ties, so the family's address
      // holder (the first guardian) is the same on every load.
      .sort(
        (a, b) =>
          relRank(a.relation) - relRank(b.relation) ||
          a.guardianId.localeCompare(b.guardianId),
      );

    const shapeStudent = (st: {
      id: string;
      firstName: string;
      lastName: string;
      status: string;
      customAnswers: unknown;
      enrollments: Array<{
        class: { name: string; level: string };
        academicYear: { label: string; isActive: boolean };
      }>;
    }): FicheStudent => {
      const enr =
        st.enrollments.find((e) => e.academicYear.isActive) ?? st.enrollments[0];
      const answers = toAnswers(st.customAnswers);
      // Per-year services map (from billing) keyed by academic-year label.
      let servicesByYear: Record<string, string> = {};
      try {
        if (answers.services_by_year)
          servicesByYear = JSON.parse(answers.services_by_year) as Record<string, string>;
      } catch {
        /* ignore malformed */
      }
      // Per-year registration snapshot (Isc_ModifStudents by SYear).
      let registrationByYear: Record<string, Record<string, string>> = {};
      try {
        if (answers.registration_by_year)
          registrationByYear = JSON.parse(answers.registration_by_year) as Record<
            string,
            Record<string, string>
          >;
      } catch {
        /* ignore malformed */
      }
      // Full parcours: each enrolled year → class → level → services (newest first).
      const parcours = st.enrollments.map((e) => ({
        year: e.academicYear.label,
        className: e.class.name,
        level: e.class.level,
        services: servicesByYear[e.academicYear.label] ?? "",
        isActive: e.academicYear.isActive,
      }));
      return {
        id: st.id,
        firstName: st.firstName,
        lastName: st.lastName,
        status: st.status,
        className: enr?.class.name ?? null,
        yearLabel: enr?.academicYear.label ?? null,
        answers,
        parcours,
        registrationByYear,
      };
    };
    const famStudents = fam?.students ?? [];
    const ficheCurrent = famStudents
      .filter((s) => s.status === "ENROLLED")
      .map(shapeStudent);
    const fichePast = famStudents
      .filter((s) => s.status !== "ENROLLED")
      .map(shapeStudent);
    const ficheFamily = {
      code: fam?.code ?? "",
      addressStreet: fam?.addressStreet ?? null,
      addressHood: fam?.addressHood ?? null,
      addressCity: fam?.addressCity ?? null,
      addressCountry: fam?.addressCountry ?? null,
      imageRights: {
        site: fam?.imageRightsSite ?? null,
        book: fam?.imageRightsBook ?? null,
        social: fam?.imageRightsSocial ?? null,
        radio: fam?.imageRightsRadio ?? null,
      },
    };

    // ─────────────────────────────────────────────────────────────────
    // Edit mode — one tab per form: the account, the responsable's
    // identity, one tab per category of the tenant's parent fields, and
    // account access last. Every tab saves on its own.
    // ─────────────────────────────────────────────────────────────────
    if (isEditMode) {
      const g = parent.guardianProfile;
      const boolStr = (b: boolean | null | undefined) =>
        b == null ? "" : b ? "yes" : "no";

      // Where a tab's values are read from and saved to. The household
      // category goes through the SAME guardian as the fiche's "Adresse du
      // foyer" block (the first one, père first), so both screens show and
      // change the same thing whichever parent is open.
      type ValueSource = {
        userId: string;
        phone: string | null;
        answers: Record<string, string>;
      };
      const self: ValueSource = {
        userId: parent.id,
        phone: g?.phone ?? null,
        answers: toAnswers(parent.customAnswers),
      };
      const holder = ficheGuardians[0];
      const household: ValueSource = holder
        ? { userId: holder.userId, phone: holder.phone, answers: holder.answers }
        : self;
      // The household tab saves through that guardian's account: when it is
      // a staff identity this operator may not write, show why instead of a
      // form that cannot save.
      const holderUser = holder
        ? fam?.guardians.find((x) => x.userId === holder.userId)?.user
        : undefined;
      const householdLocked = holderUser
        ? isLockedIdentity(holderUser)
        : staffLocked;

      // Current value of a field, in the shape the form inputs expect
      // (yes/no for booleans). Canonical columns win over the answers JSON.
      const valueOf = (f: FieldDef, src: ValueSource): string => {
        switch (f.userBoundTo) {
          case "firstName":
            return parent.firstName ?? splitLegacyName(parent.name).firstName;
          case "lastName":
            return parent.lastName ?? splitLegacyName(parent.name).lastName;
          case "name":
            return parent.name ?? "";
          case "email":
            return parent.email;
        }
        switch (f.guardianBoundTo) {
          case "phone":
            return src.phone ?? "";
          case "nationality1":
            return g?.nationality1 ?? "";
          case "nationality2":
            return g?.nationality2 ?? "";
          case "isLebanese":
            return boolStr(g?.isLebanese);
          case "passportLebanese":
            return g?.passportLebanese ?? "";
          case "relation":
            return g?.relation ?? "";
        }
        switch (f.familyBoundTo) {
          case "addressStreet":
            return fam?.addressStreet ?? "";
          case "addressHood":
            return fam?.addressHood ?? "";
          case "addressCity":
            return fam?.addressCity ?? "";
          case "addressCountry":
            return fam?.addressCountry ?? "";
          case "imageRightsSite":
            return boolStr(fam?.imageRightsSite);
          case "imageRightsBook":
            return boolStr(fam?.imageRightsBook);
          case "imageRightsSocial":
            return boolStr(fam?.imageRightsSocial);
          case "imageRightsRadio":
            return boolStr(fam?.imageRightsRadio);
        }
        // The id slot (inscription forms, acceptance bridge) wins over the
        // key slot (import); they only differ for fields made in Settings.
        return storedAnswer(src.answers, f);
      };

      // Every answer of this parent, keyed by field id — read-only context
      // so a field can depend on one that lives in another tab.
      const contextAnswers: Record<string, string> = {};
      for (const f of parentFieldsConfig.fields) {
        contextAnswers[f.id] = valueOf(f, self);
      }

      // Which fields a category tab shows. Left out: what another tab owns
      // (name and e-mail → Compte; nationalities and the other identity
      // columns → Identité), household columns when there is no household
      // to store them on, and "Actuel(le)", a mother-only field in Dars
      // (same rule as the fiche).
      const isMother = g?.relation === "mere";
      const tabFields = (categoryId: string): FieldDef[] =>
        parentFieldsConfig.fields
          .filter((f) => f.categoryId === categoryId && f.active !== false)
          .filter((f) => !f.userBoundTo)
          .filter((f) => !f.guardianBoundTo || f.guardianBoundTo === "phone")
          .filter((f) => !f.familyBoundTo || !!fam)
          .filter((f) => f.key !== "actuel" || isMother)
          .sort((a, b) => a.order - b.order);

      const categoryIcon = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes("contact")) return <Phone className="size-4" aria-hidden />;
        if (n.includes("profession"))
          return <Briefcase className="size-4" aria-hidden />;
        if (n.includes("adresse") || n.includes("address"))
          return <Home className="size-4" aria-hidden />;
        if (n.includes("arab")) return <Languages className="size-4" aria-hidden />;
        return <ClipboardList className="size-4" aria-hidden />;
      };

      const categoryTabs: EditTab[] = [];
      const activeCategories = parentFieldsConfig.categories
        .filter((c) => c.active !== false)
        .sort((a, b) => a.order - b.order);
      for (const cat of activeCategories) {
        const fields = tabFields(cat.id);
        if (fields.length === 0) continue;
        // Same convention as the fiche (_fiche.tsx): the household category
        // is the family's, the others are the parent's own.
        const shared = isHouseholdCategory(cat);
        const src = shared ? household : self;
        // A staff identity's own tabs are left out (the notice above the
        // tabs says why); the household tab stays whenever its holder can
        // be written.
        if (staffLocked && (!shared || householdLocked)) continue;
        const initialValues: Record<string, string> = {};
        for (const f of fields) initialValues[f.id] = valueOf(f, src);
        categoryTabs.push({
          id: `cat-${cat.id}`,
          label: cat.name,
          icon: categoryIcon(cat.name),
          content: shared && householdLocked ? (
            <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]">
              {t("householdLockedNotice")}
            </div>
          ) : (
            <Card>
              <CardHeader title={cat.name} />
              <CardBody>
                <ParentCategoryForm
                  // Remount when the account saved to changes (a relation
                  // edit in Compte can move the address holder): the form's
                  // values must never outlive their target.
                  key={src.userId}
                  targetUserId={src.userId}
                  category={cat}
                  fields={fields}
                  initialValues={initialValues}
                  contextAnswers={contextAnswers}
                  establishments={establishmentsForRenderer}
                  // Arabic-script values: same right-to-left block as the fiche.
                  rtl={/arab/i.test(cat.name)}
                  note={shared && fam ? t("sharedAddressNote") : undefined}
                />
              </CardBody>
            </Card>
          ),
        });
      }

      const statusPill = (
        <span
          className={cn(
            "inline-flex rounded-full px-3 py-1 text-sm font-medium",
            STATUS_TONE[parent.status],
          )}
        >
          {t(STATUS_KEY[parent.status] ?? "statusActive")}
        </span>
      );

      const editTabs: EditTab[] = staffLocked ? categoryTabs : [
        {
          id: "compte",
          label: t("tabAccount"),
          icon: <User className="size-4" aria-hidden />,
          content: (
            <Card>
              <CardHeader
                title={t("tabAccount")}
                description={t("accountCardHint")}
              />
              <CardBody>
                <EditParentForm
                  action={boundUpdate}
                  initial={{
                    firstName:
                      parent.firstName ?? splitLegacyName(parent.name).firstName,
                    lastName:
                      parent.lastName ?? splitLegacyName(parent.name).lastName,
                    email: parent.email,
                    relation: g?.relation ?? "",
                    locale: parent.locale ?? "fr",
                  }}
                  labels={{
                    firstName: labelForBoundProp("firstName", t("fieldFirstName")),
                    lastName: labelForBoundProp("lastName", t("fieldLastName")),
                    email: labelForBoundProp("email", t("fieldEmail")),
                  }}
                />
              </CardBody>
            </Card>
          ),
        },
        {
          // Lebanese, passport, nationality 1/2, mono-parental. Guardian is
          // the canonical source; the latest application's submitter*
          // columns are only a fallback for data older than those columns.
          // Writes propagate to every application the parent has submitted.
          id: "identite",
          label: t("tabIdentity"),
          icon: <IdCard className="size-4" aria-hidden />,
          content: (
            <Card>
              <CardHeader
                title={t("identityCardTitle")}
                description={t("identityCardHint")}
              />
              <CardBody>
                <ParentIdentityForm
                  action={boundUpdateIdentity}
                  hasApplications={!!latestApp}
                  initial={{
                    isLebanese:
                      g?.isLebanese ?? latestApp?.submitterIsLebanese ?? null,
                    passportLebanese:
                      g?.passportLebanese ??
                      latestApp?.submitterPassportLebanese ??
                      "",
                    nationality1:
                      g?.nationality1 ?? latestApp?.submitterNationality ?? "",
                    nationality2:
                      g?.nationality2 ?? latestApp?.submitterNationality2 ?? "",
                    monoParental:
                      g?.monoParental ?? latestApp?.monoParental ?? false,
                  }}
                />
              </CardBody>
            </Card>
          ),
        },
        ...categoryTabs,
        {
          id: "acces",
          label: t("tabAccess"),
          icon: <KeyRound className="size-4" aria-hidden />,
          content: (
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title={t("resetPassword")}
                  description={t("resetPasswordHint")}
                />
                <CardBody>
                  <ResetPasswordButton parentId={parent.id} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader
                  title={t("accessStatusTitle")}
                  description={t("accessStatusHint")}
                  action={statusPill}
                />
                <CardBody>
                  <form action={boundToggle}>
                    <Button
                      type="submit"
                      size="sm"
                      variant={parent.status === "DISABLED" ? "secondary" : "danger"}
                    >
                      {parent.status === "DISABLED"
                        ? t("enableAction")
                        : t("disableAction")}
                    </Button>
                  </form>
                </CardBody>
              </Card>
            </div>
          ),
        },
      ];

      return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={parent.name ?? parent.email}
            description={
              fam?.code
                ? t("familyCodeLine", { email: parent.email, code: fam.code })
                : parent.email
            }
            action={
              <Link
                href={`/admin/parents/${id}`}
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
                {t("backToFiche")}
              </Link>
            }
          />

          <div className="flex items-center gap-3">{statusPill}</div>

          {staffLocked ? (
            <div
              role="note"
              className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm text-[color:var(--color-foreground-muted)]"
            >
              {t("staffLockedNotice")}
            </div>
          ) : null}

          <EditTabs
            tabs={editTabs}
            initialTab={tab}
            ariaLabel={t("editTabsLabel")}
            unsavedLabel={t("unsavedChanges")}
            leaveConfirmLabel={t("unsavedLeaveConfirm")}
          />
        </main>
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // Preview mode (default) — vertical tabs + read-only sections
    // ─────────────────────────────────────────────────────────────────
    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <PageHeader
          title={parent.name ?? parent.email}
          description={
            fam?.code
              ? `${parent.email} · Code famille ${fam.code}`
              : parent.email
          }
          action={
            <div className="flex items-center gap-2">
              <Link
                href="/admin/parents"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {t("title")}
              </Link>
              <LinkButton
                href={`/admin/parents/${id}?mode=edit`}
                size="sm"
                className="gap-1.5"
              >
                <Pencil className="size-3.5" aria-hidden />
                Modifier
              </LinkButton>
            </div>
          }
        />

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex rounded-full px-3 py-1 text-sm font-medium",
              STATUS_TONE[parent.status],
            )}
          >
            {t(STATUS_KEY[parent.status] ?? "statusActive")}
          </span>
        </div>

        {/* Family fiche — père | mère parallel columns + enfants + historique */}
        <FamilyFiche
          parentConfig={parentFieldsConfig}
          studentConfig={studentFieldsConfig}
          guardians={ficheGuardians}
          family={ficheFamily}
          currentStudents={ficheCurrent}
          pastStudents={fichePast}
        />

        {/* legacy tabbed view — retained (hidden) during the fiche rollout */}
        <div className="hidden">
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <nav
            aria-label="Sections du profil"
            className="flex flex-col gap-0.5 self-start rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-2"
          >
            {TAB_DEFS.map((td) => {
              const Icon = td.icon;
              const active = td.key === currentTab;
              return (
                <Link
                  key={td.key}
                  href={`/admin/parents/${id}?tab=${td.key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-[color:var(--color-brand-50)] font-semibold text-[color:var(--color-brand-700)]"
                      : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {td.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-6">
            {currentTab === "compte" ? (
              <Card>
                <CardHeader title="Compte" description="Identité du compte utilisateur" />
                <CardBody>
                  <dl>
                    <Row
                      label={labelForBoundProp("firstName", "Prénom")}
                      value={
                        parent.firstName ??
                        splitLegacyName(parent.name).firstName
                      }
                    />
                    <Row
                      label={labelForBoundProp("lastName", "Nom")}
                      value={
                        parent.lastName ??
                        splitLegacyName(parent.name).lastName
                      }
                    />
                    <Row
                      label={labelForBoundProp("email", "Email")}
                      value={parent.email}
                    />
                    <Row
                      label="Langue"
                      value={LOCALE_LABELS[parent.locale ?? "fr"] ?? "—"}
                    />
                    <Row
                      label="Statut du compte"
                      value={t(STATUS_KEY[parent.status] ?? "statusActive")}
                    />
                    <Row label="Code famille" value={fam?.code ?? ""} />
                  </dl>
                </CardBody>
              </Card>
            ) : null}

            {currentTab === "identite" ? (() => {
              // Guardian is the canonical source — admin-editable even
              // without an application. Fall back to the latest
              // application's submitter* columns only when Guardian is
              // blank (covers legacy data pre-Guardian-identity-columns).
              const g = parent.guardianProfile;
              const isLebanese = g?.isLebanese ?? latestApp?.submitterIsLebanese ?? null;
              const passportLebanese =
                g?.passportLebanese ?? latestApp?.submitterPassportLebanese ?? "";
              const nationality1 =
                g?.nationality1 ?? latestApp?.submitterNationality ?? "";
              const nationality2 =
                g?.nationality2 ?? latestApp?.submitterNationality2 ?? "";
              const monoParental = g?.monoParental ?? latestApp?.monoParental ?? false;
              return (
                <Card>
                  <CardHeader
                    title="Identité du responsable"
                    description="Informations parent-niveau"
                  />
                  <CardBody>
                    <dl>
                      <Row
                        label="Relation avec l'enfant"
                        value={(() => {
                          const dossier = latestApp?.submitterRelation;
                          const account = g?.relation;
                          const v = dossier || account || "";
                          return v ? RELATION_LABELS_FR[v] ?? v : "";
                        })()}
                      />
                      <Row label="Nationalité libanaise" value={yn(isLebanese)} />
                      {isLebanese === true ? (
                        <Row
                          label="N° passeport / CI libanaise"
                          value={passportLebanese}
                        />
                      ) : null}
                      <Row label="Nationalité 1" value={nationality1} />
                      <Row label="Nationalité 2" value={nationality2} />
                      <Row
                        label="Famille monoparentale"
                        value={yn(monoParental)}
                      />
                    </dl>
                  </CardBody>
                </Card>
              );
            })() : null}

            {currentTab === "contact" ? (
              <Card>
                <CardHeader
                  title="Contact"
                  description="Téléphones, email, et autres coordonnées"
                />
                <CardBody>
                  {(fieldsByCategory.get("Contact") ?? []).length > 0 ? (
                    /* Custom Contact fields (e.g. "Mobile Number" bound to
                       Guardian.phone, "Email Address" bound to User.email)
                       render the canonical values via resolveFieldValue. */
                    <dl>
                      {(fieldsByCategory.get("Contact") ?? []).map((f) => (
                        <Row
                          key={f.id}
                          label={f.label}
                          value={resolveFieldValue(f.id)}
                        />
                      ))}
                    </dl>
                  ) : (
                    /* No custom Contact fields — fall back to canonical
                       phone + email so the tab isn't blank. */
                    <dl>
                      <Row
                        label="Téléphone"
                        value={parent.guardianProfile?.phone ?? ""}
                      />
                      <Row label="Email" value={parent.email} />
                    </dl>
                  )}
                </CardBody>
              </Card>
            ) : null}

            {currentTab === "foyer" ? (
              <Card>
                <CardHeader
                  title="Foyer"
                  description="Adresse du foyer et autorisations photo"
                />
                <CardBody>
                  {fam ? (
                    <>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                        Adresse
                      </h3>
                      <dl>
                        <Row label="Caza" value={fam.addressCity ?? ""} />
                        <Row label="Village" value={fam.addressHood ?? ""} />
                        <Row label="Rue" value={fam.addressStreet ?? ""} />
                        <Row label="Pays" value={fam.addressCountry ?? ""} />
                      </dl>
                      <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                        Autorisations photo
                      </h3>
                      <dl>
                        <Row label="Site internet" value={yn(fam.imageRightsSite)} />
                        <Row label="Livre souvenir" value={yn(fam.imageRightsBook)} />
                        <Row label="Réseaux sociaux" value={yn(fam.imageRightsSocial)} />
                        <Row label="Web Radio" value={yn(fam.imageRightsRadio)} />
                      </dl>
                    </>
                  ) : (
                    <p className="text-sm text-[color:var(--color-foreground-muted)]">
                      Pas de famille rattachée pour ce parent.
                    </p>
                  )}
                </CardBody>
              </Card>
            ) : null}

            {currentTab === "professionnel" ? (
              <Card>
                <CardHeader
                  title="Professionnel"
                  description="Informations professionnelles"
                />
                <CardBody>
                  {(fieldsByCategory.get("Professionnel") ?? []).length > 0 ? (
                    <dl>
                      {(fieldsByCategory.get("Professionnel") ?? []).map((f) => (
                        <Row
                          key={f.id}
                          label={f.label}
                          value={resolveFieldValue(f.id)}
                        />
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-[color:var(--color-foreground-muted)]">
                      Aucun champ professionnel configuré.
                    </p>
                  )}
                </CardBody>
              </Card>
            ) : null}

            {currentTab === "enfants" ? (
              <Card>
                <CardHeader
                  title="Enfants liés"
                  description={
                    childLinks.length === 0
                      ? t("noChildren")
                      : `${childLinks.length} enfant(s) lié(s)`
                  }
                />
                <CardBody>
                  {childLinks.length === 0 ? (
                    <p className="text-sm text-[color:var(--color-foreground-muted)]">
                      {t("noChildren")}
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {childLinks.map((link) => (
                        <li
                          key={link.studentId}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-[color:var(--color-surface-hover)]"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="size-3.5 text-[color:var(--color-foreground-muted)]" aria-hidden />
                            <span className="font-medium text-[color:var(--color-foreground)]">
                              {link.student.lastName} {link.student.firstName}
                            </span>
                            {link.isPrimary ? (
                              <span className="inline-flex rounded-full bg-[color:var(--color-brand-100)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-brand-700)]">
                                {t("primaryBadge")}
                              </span>
                            ) : null}
                          </div>
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
                  )}
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
        </div>

        {/* unlink action still available, just hidden until needed */}
        {childLinks.length > 0 && currentTab === "enfants"
          ? childLinks.map((link) => {
              // Render hidden forms so unlink stays accessible via a row's
              // detail action if we expose it later. Not currently shown.
              const boundUnlink = unlinkGuardianFromStudent.bind(
                null,
                link.student.id,
                parent.id,
              );
              return (
                <form
                  key={`unlink-${link.studentId}`}
                  action={boundUnlink}
                  className="hidden"
                >
                  <Button type="submit" size="sm" variant="ghost">
                    {t("unlinkAction")}
                  </Button>
                </form>
              );
            })
          : null}

        {/* unused vars get tree-shaken; keep for type checks */}
        {tCommon("save")[0] === "" ? null : null}
      </main>
    );
  });
}
