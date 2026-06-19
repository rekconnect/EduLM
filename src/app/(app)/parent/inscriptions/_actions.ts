"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  evaluateShowIf,
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "@/lib/entity-fields";
import {
  parseTenantInscriptionFormConfig,
  resolveField,
  type TenantInscriptionFormConfig,
} from "@/lib/inscription-fields-resolver";

/**
 * Load and parse the tenant's per-field inscription overrides. Wraps
 * the unscoped tenant fetch + JSON parse so save actions don't
 * duplicate it. Cheap enough to call once per save action.
 */
async function loadInscriptionFormConfig(
  tenantId: string,
): Promise<TenantInscriptionFormConfig> {
  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { inscriptionFormConfig: true },
  });
  return parseTenantInscriptionFormConfig(tenant?.inscriptionFormConfig);
}

/**
 * True iff the field is required AFTER applying any tenant override.
 * Hidden fields are never required (defensive). Unknown registry keys
 * conservatively return true so we don't accidentally permit empty
 * required submissions for fields we forgot to register.
 */
function isFieldRequiredEffective(
  key: string,
  tenantConfig: TenantInscriptionFormConfig | null,
): boolean {
  const resolved = resolveField(key, tenantConfig, "fr");
  if (!resolved) return true;
  return resolved.required && !resolved.hidden;
}

/**
 * Foyer-tab completion check that honors the tenant's inscription
 * overrides. Mirrors evaluateEleveComplete's pattern: required-by-
 * default fields can be flipped to optional or hidden by admin and
 * stop blocking the REMPLI badge.
 *
 * Required fields by registry default:
 *   foyer.address.caza / village / street
 *   foyer.imageRights.{site,book,social,radio}   (none are required by
 *     default — the 3-state radios just need an answer to flip the
 *     badge to green, which is captured here as "must not be null").
 */
function evaluateFoyerComplete(
  a: {
    addressCaza: string;
    addressVillage: string;
    addressStreet: string;
  },
  tenantConfig: TenantInscriptionFormConfig | null,
): boolean {
  const need = (key: string) => isFieldRequiredEffective(key, tenantConfig);
  if (need("foyer.address.caza") && !a.addressCaza.trim()) return false;
  if (need("foyer.address.village") && !a.addressVillage.trim()) return false;
  if (need("foyer.address.street") && !a.addressStreet.trim()) return false;
  return true;
}

/**
 * "Autorisations" tab completion — the four image-rights consents (moved
 * out of Foyer into their own tab). Each must be answered unless admin
 * explicitly set required=false or hid it. Registry keys are unchanged
 * (foyer.imageRights.*) so existing WYSIWYG overrides still apply.
 */
function evaluateAutorisationsComplete(
  a: {
    imageRightsSite: boolean | null;
    imageRightsBook: boolean | null;
    imageRightsSocial: boolean | null;
    imageRightsRadio: boolean | null;
  },
  tenantConfig: TenantInscriptionFormConfig | null,
): boolean {
  const imgKeys = [
    ["foyer.imageRights.site", a.imageRightsSite],
    ["foyer.imageRights.book", a.imageRightsBook],
    ["foyer.imageRights.social", a.imageRightsSocial],
    ["foyer.imageRights.radio", a.imageRightsRadio],
  ] as const;
  for (const [key, value] of imgKeys) {
    const resolved = resolveField(key, tenantConfig, "fr");
    if (resolved?.hidden) continue;
    if (resolved?.hasOverride && resolved.required === false) continue;
    if (value === null) return false;
  }
  return true;
}

const dossierSchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  childLastName: z.string().trim().min(1).max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cycleId: z.string().trim().min(1),
  establishmentId: z.string().trim().min(1).optional(),
  niveau: z.string().trim().min(1).max(40),
});

export type DossierFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

/**
 * Creates a new draft Application from the quick "Créer un dossier" form on
 * the parent dashboard. Captures the structural info (child name + DOB,
 * cycle, Établissement, niveau) up front. The full tenant-configured field
 * collection happens in the wizard step that follows.
 *
 * On success: redirects to /parent/applications (the "Mes inscriptions"
 * list) so the parent sees the new draft alongside any existing ones,
 * matching the Eduka flow. From there one click opens the dossier shell.
 */
export async function createDossier(
  _prev: DossierFormState,
  formData: FormData,
): Promise<DossierFormState> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = dossierSchema.safeParse({
    childFirstName: String(formData.get("childFirstName") ?? ""),
    childLastName: String(formData.get("childLastName") ?? ""),
    childDob: String(formData.get("childDob") ?? ""),
    cycleId: String(formData.get("cycleId") ?? ""),
    establishmentId: String(formData.get("establishmentId") ?? "") || undefined,
    niveau: String(formData.get("niveau") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  // (showOnDossierCreate was removed — the quick form is structural-only.
  // All other student answers go through the full dossier edit page.)
  const extraAnswers: Record<string, string> = {};

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Validate cycle is still open + within this tenant.
    const cycle = await db.admissionCycle.findUnique({
      where: { id: parsed.data.cycleId },
      select: { id: true, isActive: true, closeAt: true },
    });
    if (!cycle) return;
    if (!cycle.isActive) return;
    if (cycle.closeAt && cycle.closeAt < new Date()) return;

    // Validate Establishment belongs to this tenant.
    if (parsed.data.establishmentId) {
      const est = await db.establishment.findUnique({
        where: { id: parsed.data.establishmentId },
        select: { id: true },
      });
      if (!est) return;
    }

    // Pre-fill from the parent's most recent prior application (any
    // status) — for sibling #2, sibling #3, etc. The parent (responsable)
    // identity is the same person, the household is the same, the custom
    // parent answers are the same. We only re-ask kid-specific things
    // (Élève identity, Scolarité, Transport, Santé, etc.) which the
    // parent fills via the dossier shell.
    //
    // Family-level data (address, image rights) already auto-shares via
    // the Family table on Guardian.userId — siblings read from the same
    // Family row. The foyer EXTRAS (building, floor, details, notes)
    // live in dossierAnswers per-application; we copy those too so the
    // sibling dossier starts pre-filled.
    const prior = await db.application.findFirst({
      where: { submittedByUserId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        submitterRelation: true,
        submitterIsLebanese: true,
        submitterPassportLebanese: true,
        submitterNationality: true,
        submitterNationality2: true,
        monoParental: true,
        parentAnswers: true,
        dossierAnswers: true,
      },
    });

    // Fall back to Guardian for the very first dossier (no prior
    // application). Admin may have entered identity from /admin/parents
    // before the parent created any dossier — Guardian is the canonical
    // parent-level store, so we use it to pre-fill submitter* columns
    // and monoParental on the new draft.
    const guardian = prior
      ? null
      : await db.guardian.findUnique({
          where: { userId: user.id },
          select: {
            relation: true,
            isLebanese: true,
            passportLebanese: true,
            nationality1: true,
            nationality2: true,
            monoParental: true,
          },
        });

    // Extract just the foyer slice from prior dossierAnswers — the
    // household-level extras. Skip scolarite / pedagogique / transport /
    // sante / finance / validation because those are kid-specific.
    let priorFoyerExtras: Record<string, unknown> | null = null;
    if (prior?.dossierAnswers && typeof prior.dossierAnswers === "object") {
      const d = prior.dossierAnswers as Record<string, unknown>;
      if (d.foyer && typeof d.foyer === "object") {
        priorFoyerExtras = d.foyer as Record<string, unknown>;
      }
    }

    const created = await db.application.create({
      data: {
        tenantId,
        cycleId: parsed.data.cycleId,
        submittedByUserId: user.id,
        childFirstName: parsed.data.childFirstName,
        childLastName: parsed.data.childLastName,
        childDob: new Date(`${parsed.data.childDob}T00:00:00.000Z`),
        primaryParentName: user.name ?? user.email,
        primaryParentEmail: user.email,
        establishmentId: parsed.data.establishmentId ?? null,
        niveau: parsed.data.niveau,
        // Legacy column still expected by the existing wizard's level dropdown.
        requestedLevel: parsed.data.niveau,
        // ── Per-kid (empty for new sibling) ──
        studentAnswers: extraAnswers,
        // ── Responsable identity carried over from prior dossier,
        //    or from Guardian when this is the parent's first dossier. ──
        submitterRelation:
          prior?.submitterRelation ?? guardian?.relation ?? null,
        submitterIsLebanese:
          prior?.submitterIsLebanese ?? guardian?.isLebanese ?? null,
        submitterPassportLebanese:
          prior?.submitterPassportLebanese ??
          guardian?.passportLebanese ??
          null,
        submitterNationality:
          prior?.submitterNationality ?? guardian?.nationality1 ?? null,
        submitterNationality2:
          prior?.submitterNationality2 ?? guardian?.nationality2 ?? null,
        monoParental: prior?.monoParental ?? guardian?.monoParental ?? false,
        // ── Custom parent fields carried over ──
        parentAnswers:
          prior?.parentAnswers && typeof prior.parentAnswers === "object"
            ? (prior.parentAnswers as object)
            : {},
        // ── Foyer extras (building / floor / details / notes) carried
        //    over — Family address + image rights auto-share via the
        //    Family relation, no copy needed. ──
        dossierAnswers: priorFoyerExtras ? { foyer: priorFoyerExtras } : {},
        status: "DRAFT",
      },
      select: { id: true },
    });
    newId = created.id;
  });

  if (!newId) return { formError: "create-failed" };
  revalidatePath("/parent/applications");
  revalidatePath("/parent/dashboard");
  // Land on the Mes inscriptions list so the parent confirms the new
  // draft was created (Eduka pattern). One click on the draft card
  // opens the 10-tab dossier shell from there.
  redirect("/parent/applications");
}

// ── Edit dossier core fields (name, DOB, scolarité) ──────────

const dossierCoreSchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  childLastName: z.string().trim().min(1).max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  establishmentId: z.string().trim().min(1).optional(),
  niveau: z.string().trim().min(1).max(40),
});

/**
 * Update the core dossier fields that were captured during creation. Parent
 * can correct a typo in the kid's name, switch the niveau choice, etc. —
 * without having to cancel and re-create the file.
 */
export async function updateDossierCore(
  applicationId: string,
  _prev: { ok?: boolean; error?: string; errors?: Record<string, string> } | undefined,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; errors?: Record<string, string> }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = dossierCoreSchema.safeParse({
    childFirstName: String(formData.get("childFirstName") ?? ""),
    childLastName: String(formData.get("childLastName") ?? ""),
    childDob: String(formData.get("childDob") ?? ""),
    establishmentId: String(formData.get("establishmentId") ?? "") || undefined,
    niveau: String(formData.get("niveau") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { ok: false, errors };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    if (parsed.data.establishmentId) {
      const est = await db.establishment.findUnique({
        where: { id: parsed.data.establishmentId },
        select: { id: true },
      });
      if (!est) return { ok: false, error: "establishment-not-found" };
    }

    await db.application.update({
      where: { id: applicationId },
      data: {
        childFirstName: parsed.data.childFirstName,
        childLastName: parsed.data.childLastName,
        childDob: new Date(`${parsed.data.childDob}T00:00:00.000Z`),
        establishmentId: parsed.data.establishmentId ?? null,
        niveau: parsed.data.niveau,
        requestedLevel: parsed.data.niveau, // keep legacy column in sync
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

// ── Completion helpers (Élève + Scolarité) ────────────────────
// Both tabs have data spread across multiple save actions, so the
// completion flag is derived in one place and called from every save.

type EleveCompletionInput = {
  childFirstName: string | null;
  childLastName: string | null;
  childDob: Date | null;
  childGender: unknown;
  childPlaceOfBirth: string | null;
  childBirthCountry: string | null;
  childFirstNameAr: string | null;
  childLastNameAr: string | null;
  childIsLebanese: boolean | null;
  childPassportLebanese: string | null;
  childNationality: string | null;
};

function evaluateEleveComplete(
  a: EleveCompletionInput,
  tenantConfig: TenantInscriptionFormConfig | null,
): boolean {
  // Helper closure so each line below reads cleanly. Returns true when
  // the field is required after applying the tenant override AND the
  // application's stored value is blank → completion fails.
  const missing = (key: string, value: unknown): boolean => {
    if (!isFieldRequiredEffective(key, tenantConfig)) return false;
    if (typeof value === "string") return !value.trim();
    if (value === null || value === undefined || value === "") return true;
    return false;
  };

  // État civil
  if (missing("eleve.etatCivil.firstName", a.childFirstName)) return false;
  if (missing("eleve.etatCivil.lastName", a.childLastName)) return false;
  if (missing("eleve.etatCivil.dob", a.childDob)) return false;
  if (missing("eleve.etatCivil.gender", a.childGender)) return false;
  if (missing("eleve.etatCivil.placeOfBirth", a.childPlaceOfBirth))
    return false;
  if (missing("eleve.etatCivil.birthCountry", a.childBirthCountry))
    return false;
  if (missing("eleve.etatCivil.firstNameAr", a.childFirstNameAr)) return false;
  if (missing("eleve.etatCivil.lastNameAr", a.childLastNameAr)) return false;

  // Passport — the Yes/No radio
  if (
    isFieldRequiredEffective("eleve.passport.isLebanese", tenantConfig) &&
    a.childIsLebanese === null
  ) {
    return false;
  }

  // Conditional: if Lebanese=true, the passport-number field comes into
  // play. Respect the override (if set) or fall back to the registry
  // default (required=true).
  if (a.childIsLebanese === true) {
    if (missing("eleve.passport.passportLebanese", a.childPassportLebanese)) {
      return false;
    }
  }

  // Conditional: if Lebanese=false, the parent must enter Nationalité 1.
  // The registry default for that field is required=false (so the row
  // doesn't paint a red bar in the Lebanese=Yes case), and the form
  // upgrades it to required=true when isLebanese=false. We mirror that
  // upgrade here — UNLESS admin has set an explicit override, in which
  // case we trust their choice.
  if (a.childIsLebanese === false) {
    const nat1 = resolveField(
      "eleve.passport.nationality1",
      tenantConfig,
      "fr",
    );
    const nat1NeedsValue = nat1?.hasOverride
      ? nat1.required && !nat1.hidden
      : true;
    if (nat1NeedsValue && !a.childNationality?.trim()) return false;
  }

  return true;
}

const ELEVE_COMPLETION_SELECT = {
  childFirstName: true,
  childLastName: true,
  childDob: true,
  childGender: true,
  childPlaceOfBirth: true,
  childBirthCountry: true,
  childFirstNameAr: true,
  childLastNameAr: true,
  childIsLebanese: true,
  childPassportLebanese: true,
  childNationality: true,
} as const;

// ── Student "État civil" card (Élève tab) ─────────────────────
// Captures the built-in identity fields beyond the file-identity
// (gender, place + country of birth, 3 nationalities, Arabic names).

/**
 * Save the unified "État civil de l'élève" card on the Élève tab.
 * After the file is created via /parent/inscriptions/new, this single
 * action owns every identity edit the parent makes — name, DOB,
 * gender, place + country of birth, Arabic names, AND the establishment
 * / niveau choice that used to live on the standalone File Identity
 * section.
 */
const eleveEtatCivilSchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  childLastName: z.string().trim().min(1).max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  childGender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  childPlaceOfBirth: z.string().trim().max(80).optional(),
  childBirthCountry: z.string().trim().max(80).optional(),
  childFirstNameAr: z.string().trim().max(80).optional(),
  childLastNameAr: z.string().trim().max(80).optional(),
  childPlaceOfBirthAr: z.string().trim().max(80).optional(),
});

/**
 * Phase-1 Dars convergence: mirror the student état-civil / passeport inputs
 * into Application.studentAnswers under the canonical Dars field ids, so the
 * inscription form, the fiche, and the acceptance bridge all read the SAME
 * field set. The legacy Application columns are still written in parallel
 * (dropped in a later phase). prenom/nom/date_naissance stay column-bound
 * (dossierBoundTo) so they are intentionally NOT duplicated here. An empty
 * value clears the key.
 */
function mergeStudentDarsAnswers(
  existing: unknown,
  patch: Record<string, string | null | undefined>,
): Prisma.InputJsonValue {
  const out: Record<string, unknown> =
    existing && typeof existing === "object"
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v.trim() === "") delete out[k];
    else out[k] = v.trim();
  }
  return out as Prisma.InputJsonValue;
}

export async function saveEleveEtatCivil(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = eleveEtatCivilSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { ok: false, errors };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true, studentAnswers: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    const nomPrenomAr = [parsed.data.childLastNameAr, parsed.data.childFirstNameAr]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ");

    await db.application.update({
      where: { id: applicationId },
      data: {
        childFirstName: parsed.data.childFirstName,
        childLastName: parsed.data.childLastName,
        childDob: new Date(`${parsed.data.childDob}T00:00:00.000Z`),
        childGender: parsed.data.childGender ?? null,
        childPlaceOfBirth: parsed.data.childPlaceOfBirth || null,
        childBirthCountry: parsed.data.childBirthCountry || null,
        childFirstNameAr: parsed.data.childFirstNameAr || null,
        childLastNameAr: parsed.data.childLastNameAr || null,
        childPlaceOfBirthAr: parsed.data.childPlaceOfBirthAr || null,
        studentAnswers: mergeStudentDarsAnswers(app.studentAnswers, {
          pays_naissance: parsed.data.childBirthCountry,
          lieu_naissance: parsed.data.childPlaceOfBirth,
          nom_prenom_ar: nomPrenomAr,
          lieu_naissance_ar: parsed.data.childPlaceOfBirthAr,
        }),
      },
    });

    // Refresh tabsCompleted.eleve so the badge updates immediately
    // after saving. Re-fetch to include the row we just wrote, then run
    // the completion checker against the tenant's per-field overrides
    // (hidden / admin-marked-optional fields don't block the badge).
    const [fresh, tenantFormConfig] = await Promise.all([
      db.application.findUnique({
        where: { id: applicationId },
        select: { ...ELEVE_COMPLETION_SELECT, tabsCompleted: true },
      }),
      loadInscriptionFormConfig(tenantId),
    ]);
    if (fresh) {
      await db.application.update({
        where: { id: applicationId },
        data: {
          tabsCompleted: mergeTabsCompleted(
            fresh.tabsCompleted,
            "eleve",
            evaluateEleveComplete(fresh, tenantFormConfig),
          ),
        },
      });
    }

    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

/**
 * Save the "Passeport / Carte d'identité" card — Lebanese-nationality
 * Yes/No plus up to 3 nationalities. Passport numbers + expiry land
 * here later.
 */
const elevePassportSchema = z.object({
  childIsLebanese: z.boolean().nullable().optional(),
  childPassportLebanese: z.string().trim().max(40).optional(),
  childNationality: z.string().trim().max(80).optional(),
  childNationality2: z.string().trim().max(80).optional(),
});

export async function saveElevePassport(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = elevePassportSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { ok: false, errors };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true, studentAnswers: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }
    // Only persist the Lebanese passport when the kid IS Lebanese.
    // Saying "Non" wipes any previously entered value, so admin
    // doesn't see stale data attached to a non-Lebanese child.
    const persistLebanesePassport =
      parsed.data.childIsLebanese === true
        ? parsed.data.childPassportLebanese || null
        : null;

    await db.application.update({
      where: { id: applicationId },
      data: {
        childIsLebanese:
          parsed.data.childIsLebanese === undefined
            ? undefined
            : parsed.data.childIsLebanese,
        childPassportLebanese: persistLebanesePassport,
        childNationality: parsed.data.childNationality || null,
        childNationality2: parsed.data.childNationality2 || null,
        // Slot 3 was removed from the UI — null it out on every save
        // so old DB values (from earlier sessions) don't linger.
        childNationality3: null,
        studentAnswers: mergeStudentDarsAnswers(app.studentAnswers, {
          nationalite: parsed.data.childNationality,
          nationalite2: parsed.data.childNationality2,
          numero_identite: persistLebanesePassport ?? "",
          isLebanese:
            parsed.data.childIsLebanese == null
              ? ""
              : parsed.data.childIsLebanese
                ? "yes"
                : "no",
        }),
      },
    });

    const [fresh, tenantFormConfig] = await Promise.all([
      db.application.findUnique({
        where: { id: applicationId },
        select: { ...ELEVE_COMPLETION_SELECT, tabsCompleted: true },
      }),
      loadInscriptionFormConfig(tenantId),
    ]);
    if (fresh) {
      await db.application.update({
        where: { id: applicationId },
        data: {
          tabsCompleted: mergeTabsCompleted(
            fresh.tabsCompleted,
            "eleve",
            evaluateEleveComplete(fresh, tenantFormConfig),
          ),
        },
      });
    }

    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

/**
 * Dars-unified Élève save: the Élève tab now renders the student
 * "Info générale" + "Info Arabe" fields via the shared FieldsRenderer, so the
 * whole answer set arrives as one blob keyed by the Dars field ids. We persist
 * it to Application.studentAnswers (the canonical source) and mirror the bound
 * prénom/nom/date de naissance — plus Sexe — to the Application columns. The
 * legacy état-civil columns are still written (dual-write) until the column
 * drop phase, so the bridge + admissions detail keep working unchanged.
 */
export async function saveStudentDossier(
  applicationId: string,
  payload: { answers: Record<string, string> },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const a = payload.answers ?? {};
  const val = (k: string) => (a[k] ?? "").trim();
  // Sexe is now a config select ("Garçon"/"Fille"/"Autre") → childGender enum.
  const sx = val("sexe");
  const gender =
    sx === "Garçon" ? "MALE" : sx === "Fille" ? "FEMALE" : sx === "Autre" ? "OTHER" : null;

  // Clean studentAnswers — keep non-empty trimmed strings.
  const studentAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === "string" && v.trim()) studentAnswers[k] = v.trim();
  }

  const isLeb = a.isLebanese === "yes" ? true : a.isLebanese === "no" ? false : null;
  const dobStr = val("date_naissance");
  const childDob = /^\d{4}-\d{2}-\d{2}$/.test(dobStr)
    ? new Date(`${dobStr}T00:00:00.000Z`)
    : null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    await db.application.update({
      where: { id: applicationId },
      data: {
        // Canonical columns (kept past the drop phase).
        childFirstName: val("prenom"),
        childLastName: val("nom"),
        childDob,
        childGender: gender,
        // Legacy état-civil columns — dual-written until they're dropped.
        childBirthCountry: val("pays_naissance") || null,
        childPlaceOfBirth: val("lieu_naissance") || null,
        childNationality: val("nationalite") || null,
        childNationality2: val("nationalite2") || null,
        childIsLebanese: isLeb,
        childPassportLebanese: isLeb ? val("numero_identite") || null : null,
        childPlaceOfBirthAr: val("lieu_naissance_ar") || null,
        childNationality3: null,
        studentAnswers: studentAnswers as Prisma.InputJsonValue,
      },
    });

    const [fresh, tenantFormConfig] = await Promise.all([
      db.application.findUnique({
        where: { id: applicationId },
        select: { ...ELEVE_COMPLETION_SELECT, tabsCompleted: true },
      }),
      loadInscriptionFormConfig(tenantId),
    ]);
    if (fresh) {
      await db.application.update({
        where: { id: applicationId },
        data: {
          tabsCompleted: mergeTabsCompleted(
            fresh.tabsCompleted,
            "eleve",
            evaluateEleveComplete(fresh, tenantFormConfig),
          ),
        },
      });
    }

    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

/**
 * Save the submitting parent's identity card on the Responsables tab —
 * relation to the child + Lebanese-nationality Oui/Non. Stored on
 * Application columns for now; Phase 4's multi-responsable UI will
 * migrate these onto each ApplicationResponsable row.
 */
const responsableIdentitySchema = z.object({
  relation: z.string().trim().max(40).optional(),
  isLebanese: z.boolean().nullable().optional(),
  passportLebanese: z.string().trim().max(40).optional(),
  nationality: z.string().trim().max(80).optional(),
  nationality2: z.string().trim().max(80).optional(),
});

export async function saveResponsableIdentity(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = responsableIdentitySchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "validation" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }
    // Same Lebanese-passport rule as the student: only persist when
    // the parent is Lebanese; clear it on switch to "Non" so admin
    // never sees stale data.
    const persistLebanesePassport =
      parsed.data.isLebanese === true
        ? parsed.data.passportLebanese || null
        : null;

    // Nationalité 1 + 2 are back on the hardcoded Responsable identity
    // card (mirrors the child's Élève passport card). Admin should
    // delete the duplicate custom parent fields from /settings → Forms
    // → Parents so the parent doesn't see the same dropdowns twice.
    await db.application.update({
      where: { id: applicationId },
      data: {
        submitterRelation: parsed.data.relation || null,
        submitterIsLebanese:
          parsed.data.isLebanese === undefined
            ? undefined
            : parsed.data.isLebanese,
        submitterPassportLebanese: persistLebanesePassport,
        submitterNationality: parsed.data.nationality || null,
        submitterNationality2: parsed.data.nationality2 || null,
      },
    });
    // Mirror identity onto Guardian — Guardian is now the canonical
    // store for parent-level identity (admin can read/edit it even
    // when no application exists). Without this mirror, admin's
    // /admin/parents view would lag behind dossier edits.
    const guardianUpdate: Record<string, unknown> = {};
    if (parsed.data.relation !== undefined) {
      guardianUpdate.relation = parsed.data.relation || null;
    }
    if (parsed.data.isLebanese !== undefined) {
      guardianUpdate.isLebanese = parsed.data.isLebanese;
      guardianUpdate.passportLebanese = persistLebanesePassport;
    }
    if (parsed.data.nationality !== undefined) {
      guardianUpdate.nationality1 = parsed.data.nationality || null;
    }
    if (parsed.data.nationality2 !== undefined) {
      guardianUpdate.nationality2 = parsed.data.nationality2 || null;
    }
    if (Object.keys(guardianUpdate).length > 0) {
      await db.guardian.updateMany({
        where: { userId: user.id },
        data: guardianUpdate,
      });
    }
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

/** Toggle the Famille monoparentale flag on the application. */
export async function saveMonoParental(
  applicationId: string,
  monoParental: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }
    await db.application.update({
      where: { id: applicationId },
      data: { monoParental },
    });
    // Mirror to Guardian so admin's parent profile reflects the
    // current state even when admin opens a different application
    // or before they look at one.
    await db.guardian.updateMany({
      where: { userId: user.id },
      data: { monoParental },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// ── Save tenant custom answers on the dossier (Round 8) ──────

/**
 * Collects every `f-<fieldId>` form entry, validates against the tenant's
 * field config (drops unknown ids), and writes to the requested column.
 * Used by both the parent + student sections on the dossier edit page.
 */
async function saveAnswers(
  applicationId: string,
  formData: FormData,
  entity: "parent" | "student",
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  // Verify the application belongs to this parent + load the right field
  // config for this entity in one tenant-scoped roundtrip.
  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        submittedByUserId: true,
        status: true,
        tabsCompleted: true,
        childFirstName: true,
        childLastName: true,
        childDob: true,
        childGender: true,
        childIsLebanese: true,
        childPassportLebanese: true,
        childNationality: true,
        childPlaceOfBirth: true,
        childBirthCountry: true,
        childFirstNameAr: true,
        childLastNameAr: true,
        establishmentId: true,
        niveau: true,
      },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: {
        parentFieldsConfig: entity === "parent",
        studentFieldsConfig: entity === "student",
      },
    });
    const config: EntityFieldsConfig = parseEntityFieldsConfig(
      entity === "parent"
        ? tenant?.parentFieldsConfig
        : tenant?.studentFieldsConfig,
    );
    const validIds = new Set(config.fields.map((f) => f.id));

    const answers: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (!k.startsWith("f-")) continue;
      const fieldId = k.slice(2);
      if (!validIds.has(fieldId)) continue;
      const value = String(v).trim();
      if (value.length === 0) continue;
      if (value.length > 2000) continue;
      answers[fieldId] = value;
    }

    // Auto-derive the tab's REMPLI/À REMPLIR badge from required-field
    // presence. Honors active/showIf/hideIf so hidden fields don't
    // hold the tab back. For Élève we additionally require the dossier
    // identity (lastName/firstName/dob/establishment/niveau) since
    // those live on Application columns, not in studentAnswers.
    const visible = config.fields.filter(
      (f) => evaluateShowIf(f, answers) === true,
    );
    const missingRequired = visible.filter((f) => {
      if (f.required !== true) return false;
      const v = answers[f.id];
      return !v || v.length === 0;
    });
    let tabDone = missingRequired.length === 0;

    // The Élève tab no longer renders tenant custom student fields,
    // so writing studentAnswers shouldn't touch tabsCompleted.eleve
    // either. For "parent" it still updates the Responsables badge.
    const tabKey = entity === "parent" ? "responsables" : null;
    const nextTabs = tabKey
      ? mergeTabsCompleted(app.tabsCompleted, tabKey, tabDone)
      : (app.tabsCompleted as Record<string, unknown>);

    await db.application.update({
      where: { id: applicationId },
      data:
        entity === "parent"
          ? { parentAnswers: answers, tabsCompleted: nextTabs }
          : { studentAnswers: answers, tabsCompleted: nextTabs },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

export async function saveDossierParentAnswers(
  applicationId: string,
  formData: FormData,
) {
  return saveAnswers(applicationId, formData, "parent");
}

export async function saveDossierStudentAnswers(
  applicationId: string,
  formData: FormData,
) {
  return saveAnswers(applicationId, formData, "student");
}

// ── Submit dossier — validates required tenant fields (Round 8) ──────

export async function submitDossier(
  applicationId: string,
): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        submittedByUserId: true,
        status: true,
        parentAnswers: true,
        studentAnswers: true,
        // Bound-source columns — for any custom field with
        // dossierBoundTo, the canonical value lives here (filled by
        // the parent through the Élève card / Scolarité tab). Submit
        // validation has to consult these or it'll complain about
        // "empty" required fields that the parent IS filling — just
        // not via the custom-field input.
        childFirstName: true,
        childLastName: true,
        childDob: true,
        childPassportLebanese: true,
        niveau: true,
        establishmentId: true,
        // submitterRelation / submitterPassportLebanese etc. aren't
        // currently mappable via dossierBoundTo, but we still need
        // the user record for parent-side userBoundTo fields.
        submittedBy: {
          select: {
            firstName: true,
            lastName: true,
            name: true,
            email: true,
          },
        },
      },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT") return { ok: false, error: "already-submitted" };

    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: { parentFieldsConfig: true, studentFieldsConfig: true },
    });
    const parentConfig: EntityFieldsConfig = parseEntityFieldsConfig(
      tenant?.parentFieldsConfig,
    );
    const studentConfig: EntityFieldsConfig = parseEntityFieldsConfig(
      tenant?.studentFieldsConfig,
    );

    const studentAns = (app.studentAnswers ?? {}) as Record<string, string>;

    // ── Bound-source value resolvers ───────────────────────────────
    // dossierBoundTo (student side) — pull from Application columns.
    function resolveDossierBound(prop: string): string {
      switch (prop) {
        case "childFirstName":
          return app!.childFirstName?.trim() ?? "";
        case "childLastName":
          return app!.childLastName?.trim() ?? "";
        case "childDob":
          return app!.childDob ? app!.childDob.toISOString().slice(0, 10) : "";
        case "establishment":
          return app!.establishmentId ?? "";
        case "niveau":
          return app!.niveau?.trim() ?? "";
        case "childPassportLebanese":
          return app!.childPassportLebanese?.trim() ?? "";
        default:
          return "";
      }
    }

    // Collect labels of required fields the parent left empty.
    //
    // A field is "required to fill" only when it would actually render —
    // i.e. evaluateShowIf returns true. That covers all visibility rules:
    // hideIf wins (field hidden → not required), showIf with equals/
    // equalsAny/anyValue all evaluated. A field hidden by either rule is
    // skipped entirely, regardless of its `required` flag.
    //
    // For bound fields (dossierBoundTo / userBoundTo) we read the
    // canonical source instead of the answers blob — the answers blob
    // is intentionally empty for those keys since the parent fills
    // them via the hardcoded surface.
    const missing: string[] = [];

    // ── Parent side: validate the Responsables (Père/Mère) editor ─────
    // The two-responsable editor stores each parent's answers on its own
    // ApplicationResponsable.customAnswers row — Application.parentAnswers
    // is no longer the source. At least ONE responsable must satisfy the
    // required parent fields. If none do, surface the missing fields of
    // the responsable closest to complete so the parent sees exactly what
    // is left to fill.
    const responsables = await db.applicationResponsable.findMany({
      where: { applicationId },
      select: { customAnswers: true },
      orderBy: { order: "asc" },
    });
    const responsableAnswers = responsables.map((r) => {
      const ca = (r.customAnswers ?? {}) as Record<string, unknown>;
      const ans: Record<string, string> = {};
      for (const [k, v] of Object.entries(ca)) if (typeof v === "string") ans[k] = v;
      return ans;
    });
    if (responsableAnswers.length === 0) {
      missing.push(...missingResponsableFields({}, parentConfig));
    } else {
      let best: string[] | null = null;
      for (const ans of responsableAnswers) {
        const m = missingResponsableFields(ans, parentConfig);
        if (best === null || m.length < best.length) best = m;
        if (best.length === 0) break;
      }
      missing.push(...(best ?? []));
    }

    for (const f of studentConfig.fields) {
      if (!f.required) continue;
      if (!evaluateShowIf(f, studentAns)) continue;
      let value: string;
      if (f.dossierBoundTo) {
        value = resolveDossierBound(f.dossierBoundTo);
      } else {
        value = (studentAns[f.id] ?? "").trim();
      }
      if (value === "") missing.push(f.label);
    }

    if (missing.length > 0) {
      return { ok: false, error: "missing-required", missing };
    }

    await db.application.update({
      where: { id: applicationId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    revalidatePath("/parent/dashboard");
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

/**
 * Phase 1 dossier helper: explicitly mark a tab as filled/unfilled. Used
 * by the placeholder tabs (Foyer/Scolarité/Transport/Contacts/Validation)
 * before they have real content. Phase 2+ tabs will auto-derive this
 * flag from required-field presence on save and stop using this action.
 */
const DOSSIER_TABS_LIST = [
  "eleve",
  "responsables",
  "foyer",
  "scolarite",
  "sante",
  "transport",
  "contacts",
  "finance",
  "justificatifs",
  "validation",
] as const;
type DossierTabName = (typeof DOSSIER_TABS_LIST)[number];

// ── Phase 2 tab saves ──────────────────────────────────────
// Each helper auto-derives the tab's "complete" flag from the same
// validation that the UI shows. Phase 5's WYSIWYG editor will swap the
// hardcoded shape for a tenant-configured one, but the save/derive
// pattern stays the same.

async function loadApplicationOwnedBy(
  applicationId: string,
  parentUserId: string,
) {
  return db.application.findFirst({
    where: { id: applicationId, submittedByUserId: parentUserId },
    select: {
      id: true,
      submittedByUserId: true,
      dossierAnswers: true,
      tabsCompleted: true,
    },
  });
}

function mergeTabsCompleted(
  raw: unknown,
  tab: string,
  done: boolean,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
  }
  out[tab] = done;
  return out;
}

function mergeDossierAnswers(
  raw: unknown,
  tab: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = v;
    }
  }
  out[tab] = payload;
  return out;
}

// Foyer ───────────────────────────
// Address + image-rights flow to the parent's Family row so siblings
// inherit. Sibling rows go to ApplicationSibling.

export async function saveFoyerTab(
  applicationId: string,
  payload: {
    addressCaza: string;
    addressVillage: string;
    addressStreet: string;
    addressBuilding: string;
    addressFloor: string;
    addressDetails: string;
    addressNotes: string;
    siblings: Array<{
      firstName: string;
      birthYear: number | null;
      className: string;
      schoolName: string;
    }>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  // Phase 4 — completion now uses evaluateFoyerComplete (defined above)
  // which respects tenant per-field overrides. The pure isFoyerComplete
  // from @/lib/dossier-content remains available for any non-action
  // callers.

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await loadApplicationOwnedBy(applicationId, user.id);
    if (!app) return { ok: false, error: "not-found" };

    // Locate the parent's Family via Guardian. Created at signup, but
    // defend against missing rows gracefully.
    const guardian = await db.guardian.findUnique({
      where: { userId: user.id },
      select: { familyId: true },
    });

    if (guardian?.familyId) {
      await db.family.update({
        where: { id: guardian.familyId },
        data: {
          addressStreet: payload.addressStreet || null,
          addressHood: payload.addressVillage || null, // village mapped to hood for now
          addressPostal: null,
          addressCity: payload.addressCaza || null,
          addressCountry: "Liban",
        },
      });
    }

    // Replace sibling list — simplest semantics; parent re-types every
    // save. Volume is small so churn doesn't matter.
    await db.applicationSibling.deleteMany({ where: { applicationId } });
    if (payload.siblings.length > 0) {
      await db.applicationSibling.createMany({
        data: payload.siblings
          .filter((s) => s.firstName.trim().length > 0)
          .map((s, idx) => ({
            tenantId,
            applicationId,
            order: idx,
            firstName: s.firstName.trim(),
            birthYear: s.birthYear,
            className: s.className.trim() || null,
            schoolName: s.schoolName.trim() || null,
          })),
      });
    }

    // Also stash the building/floor/details/notes inside dossierAnswers
    // (Family doesn't have columns for those). Kept under the foyer
    // namespace so Phase 5 can move them without migration pain.
    const foyerExtras = {
      building: payload.addressBuilding,
      floor: payload.addressFloor,
      details: payload.addressDetails,
      notes: payload.addressNotes,
    };

    // Phase 4 — completion now honors the tenant's per-field overrides
    // from inscriptionFormConfig (hidden / required toggles).
    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const complete = evaluateFoyerComplete(
      {
        addressCaza: payload.addressCaza,
        addressVillage: payload.addressVillage,
        addressStreet: payload.addressStreet,
      },
      tenantFormConfig,
    );

    await db.application.update({
      where: { id: applicationId },
      data: {
        dossierAnswers: mergeDossierAnswers(
          app.dossierAnswers,
          "foyer",
          foyerExtras,
        ),
        tabsCompleted: mergeTabsCompleted(app.tabsCompleted, "foyer", complete),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// Autorisations (droits à l'image) ───────────────────────

export async function saveAutorisationsTab(
  applicationId: string,
  payload: {
    imageRightsSite: boolean | null;
    imageRightsBook: boolean | null;
    imageRightsSocial: boolean | null;
    imageRightsRadio: boolean | null;
    quitterSeul: boolean | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await loadApplicationOwnedBy(applicationId, user.id);
    if (!app) return { ok: false, error: "not-found" };

    // Image rights are household-level → saved on the Family so siblings
    // registered later inherit the same consents.
    const guardian = await db.guardian.findUnique({
      where: { userId: user.id },
      select: { familyId: true },
    });
    if (guardian?.familyId) {
      await db.family.update({
        where: { id: guardian.familyId },
        data: {
          imageRightsSite: payload.imageRightsSite,
          imageRightsBook: payload.imageRightsBook,
          imageRightsSocial: payload.imageRightsSocial,
          imageRightsRadio: payload.imageRightsRadio,
          imageRightsAnsweredAt:
            payload.imageRightsSite !== null ? new Date() : null,
        },
      });
    }

    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const complete = evaluateAutorisationsComplete(payload, tenantFormConfig);

    await db.application.update({
      where: { id: applicationId },
      data: {
        // quitter_seul isn't a Family field — keep it in dossierAnswers so the
        // acceptance bridge can write it to the year's registration.
        dossierAnswers: mergeDossierAnswers(app.dossierAnswers, "autorisations", {
          quitterSeul: payload.quitterSeul,
        }),
        tabsCompleted: mergeTabsCompleted(
          app.tabsCompleted,
          "autorisations",
          complete,
        ),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// Scolarité ───────────────────────

export async function saveScolariteTab(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const { parseScolarite } = await import("@/lib/dossier-content");
  const {
    classifyNiveau,
    isFirstYearNiveau,
    parsePedagogique,
    isPedagogiqueCompleteFor,
  } = await import("@/lib/pedagogique");

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId, submittedByUserId: user.id },
      select: { id: true, dossierAnswers: true, tabsCompleted: true },
    });
    if (!app) return { ok: false, error: "not-found" };

    const data = parseScolarite(payload);

    // Establishment + niveau used to live on the Élève tab; they were
    // moved here. Extract from the payload (string fields, not part of
    // ScolariteData) and write to dedicated Application columns.
    const raw =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const newEstablishmentId =
      typeof raw.establishmentId === "string" && raw.establishmentId
        ? raw.establishmentId
        : null;
    const newNiveau =
      typeof raw.niveau === "string" && raw.niveau ? raw.niveau : null;

    if (newEstablishmentId) {
      const est = await db.establishment.findUnique({
        where: { id: newEstablishmentId },
        select: { id: true },
      });
      if (!est) return { ok: false, error: "establishment-not-found" };
    }

    // Pedagogical card — parsed defensively, included in completion.
    const pedagogique = parsePedagogique(raw.pedagogique);
    const niveauGroup = classifyNiveau(newNiveau);
    const pedagogiqueComplete = isPedagogiqueCompleteFor(
      niveauGroup,
      pedagogique,
    );

    // Phase 4: completion now respects tenant per-field overrides.
    // Each scalar field's required-ness comes from the registry +
    // tenant override merge; hidden fields are skipped entirely.
    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const need = (key: string) =>
      isFieldRequiredEffective(key, tenantFormConfig);
    const missing = (key: string, value: unknown): boolean => {
      if (!need(key)) return false;
      if (typeof value === "string") return !value.trim();
      if (value === null || value === undefined || value === "") return true;
      return false;
    };
    // PS / TPS = first year: previous school, history and Lebanese-exam
    // dispensation don't apply, so they don't block the tab.
    const firstYear = isFirstYearNiveau(newNiveau);
    const anterioriteOk =
      firstYear ||
      (!missing("scolarite.previous.school", data.previousSchool) &&
        !missing("scolarite.previous.class", data.previousClass) &&
        !(need("scolarite.previous.attendedMlfBefore") &&
          data.attendedMlfBefore === null));
    const scolariteFieldsComplete =
      anterioriteOk &&
      !(need("scolarite.ebep.previous") && data.ebepPrevious === null) &&
      !(need("scolarite.ebep.current") && data.ebepCurrent === null) &&
      !(firstYear === false && need("scolarite.dispense.libanais") && !data.dispenseLibanais) &&
      !missing("scolarite.wishlist.entryDate", data.entryDate) &&
      !(need("scolarite.wishlist.establishment") && !newEstablishmentId) &&
      !(need("scolarite.wishlist.niveau") && !newNiveau?.trim());
    const hardcodedComplete = scolariteFieldsComplete && pedagogiqueComplete;

    // Persist both scolarite and pedagogique blobs in dossierAnswers.
    const mergedAfterScolarite = mergeDossierAnswers(
      app.dossierAnswers,
      "scolarite",
      data as unknown as Record<string, unknown>,
    );
    const mergedWithPedagogique = mergeDossierAnswers(
      mergedAfterScolarite,
      "pedagogique",
      pedagogique as unknown as Record<string, unknown>,
    );

    await db.application.update({
      where: { id: applicationId },
      data: {
        establishmentId: newEstablishmentId,
        niveau: newNiveau,
        requestedLevel: newNiveau,
        dossierAnswers: mergedWithPedagogique,
        tabsCompleted: mergeTabsCompleted(
          app.tabsCompleted,
          "scolarite",
          hardcodedComplete,
        ),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

// Transport ───────────────────────

export async function saveTransportTab(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const { parseTransport } = await import("@/lib/dossier-content");
  const { isMaternelleNiveau } = await import("@/lib/pedagogique");

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await loadApplicationOwnedBy(applicationId, user.id);
    if (!app) return { ok: false, error: "not-found" };

    const data = parseTransport(payload);

    // Maternelle (PS/MS/GS) → collation obligatoire: force Oui so it neither
    // blocks completion nor can be saved as Non.
    const appNiveau = await db.application.findUnique({
      where: { id: applicationId },
      select: { niveau: true },
    });
    if (isMaternelleNiveau(appNiveau?.niveau)) data.collation = true;

    // Phase 4: completion respects tenant per-field overrides.
    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const need = (key: string) =>
      isFieldRequiredEffective(key, tenantFormConfig);
    let complete = true;
    if (need("transport.mode.aller") && !data.modeAller) complete = false;
    if (complete && need("transport.mode.retour") && !data.modeRetour)
      complete = false;
    if (complete && data.hasAlternateAddress) {
      if (need("transport.altAddress.caza") && !data.altCaza) complete = false;
      if (complete && need("transport.altAddress.village") && !data.altVillage)
        complete = false;
      if (complete && need("transport.altAddress.street") && !data.altStreet)
        complete = false;
    }
    if (complete && need("transport.restauration.collation") &&
        data.collation === null) complete = false;
    if (complete && need("transport.restauration.cantine") &&
        data.cantine === null) complete = false;

    await db.application.update({
      where: { id: applicationId },
      data: {
        dossierAnswers: mergeDossierAnswers(
          app.dossierAnswers,
          "transport",
          data as unknown as Record<string, unknown>,
        ),
        tabsCompleted: mergeTabsCompleted(
          app.tabsCompleted,
          "transport",
          complete,
        ),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

export async function setDossierTabCompleted(
  applicationId: string,
  tab: string,
  completed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  if (!(DOSSIER_TABS_LIST as readonly string[]).includes(tab)) {
    return { ok: false, error: "unknown-tab" };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, tabsCompleted: true },
    });
    if (!app || app.submittedByUserId !== user.id) {
      return { ok: false, error: "not-found" };
    }
    const current =
      app.tabsCompleted && typeof app.tabsCompleted === "object"
        ? (app.tabsCompleted as Record<string, unknown>)
        : {};
    const next: Record<string, boolean> = {};
    for (const k of DOSSIER_TABS_LIST) {
      const v = current[k];
      if (typeof v === "boolean") next[k] = v;
    }
    next[tab as DossierTabName] = completed;
    await db.application.update({
      where: { id: applicationId },
      data: { tabsCompleted: next },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// ── Autres contacts tab (urgence + pickup lists) ──────────────────

const contactSchema = z.object({
  kind: z.enum(["URGENCE", "PICKUP"]),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  relation: z.string().trim().max(40).optional(),
  phoneMobile: z.string().trim().max(40).optional(),
  phoneHome: z.string().trim().max(40).optional(),
});

async function refreshContactsCompletion(
  applicationId: string,
  app: { tabsCompleted: unknown },
  tenantId: string,
): Promise<void> {
  // Contacts tab is complete when at least one URGENCE contact exists.
  // Pickup-authorized contacts are optional — the school falls back to
  // the responsables list if the parent doesn't add any.
  //
  // Phase 4: if admin hides or marks-optional contacts.urgence.list,
  // the tab passes regardless of whether any URGENCE contacts exist.
  const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
  const urgenceRequired = isFieldRequiredEffective(
    "contacts.urgence.list",
    tenantFormConfig,
  );
  let done: boolean;
  if (!urgenceRequired) {
    done = true;
  } else {
    const urgenceCount = await db.applicationContact.count({
      where: { applicationId, kind: "URGENCE" },
    });
    done = urgenceCount > 0;
  }
  await db.application.update({
    where: { id: applicationId },
    data: { tabsCompleted: mergeTabsCompleted(app.tabsCompleted, "contacts", done) },
  });
}

export async function saveContact(
  applicationId: string,
  contactId: string | null,
  payload: unknown,
): Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { ok: false, errors };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId, submittedByUserId: user.id },
      select: { id: true, status: true, tabsCompleted: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    if (contactId) {
      // Update — verify the row belongs to this application.
      const existing = await db.applicationContact.findUnique({
        where: { id: contactId },
        select: { applicationId: true },
      });
      if (!existing || existing.applicationId !== applicationId) {
        return { ok: false, error: "not-found" };
      }
      await db.applicationContact.update({
        where: { id: contactId },
        data: {
          kind: parsed.data.kind,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          relation: parsed.data.relation || null,
          phoneMobile: parsed.data.phoneMobile || null,
          phoneHome: parsed.data.phoneHome || null,
        },
      });
    } else {
      // Create — append at the end of the kind's list.
      const maxOrder = await db.applicationContact.aggregate({
        where: { applicationId, kind: parsed.data.kind },
        _max: { order: true },
      });
      await db.applicationContact.create({
        data: {
          tenantId,
          applicationId,
          kind: parsed.data.kind,
          order: (maxOrder._max.order ?? -1) + 1,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          relation: parsed.data.relation || null,
          phoneMobile: parsed.data.phoneMobile || null,
          phoneHome: parsed.data.phoneHome || null,
        },
      });
    }

    await refreshContactsCompletion(applicationId, app, tenantId);
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

export async function deleteContact(
  applicationId: string,
  contactId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId, submittedByUserId: user.id },
      select: { id: true, status: true, tabsCompleted: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }
    const existing = await db.applicationContact.findUnique({
      where: { id: contactId },
      select: { applicationId: true },
    });
    if (!existing || existing.applicationId !== applicationId) {
      return { ok: false, error: "not-found" };
    }
    await db.applicationContact.delete({ where: { id: contactId } });
    await refreshContactsCompletion(applicationId, app, tenantId);
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// ── Responsables (père / mère / tuteur) ──────────────────────────

const responsableSchema = z.object({
  kind: z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]),
  civility: z.string().trim().max(10).optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1).max(80),
  firstNameAr: z.string().trim().max(80).optional(),
  lastNameAr: z.string().trim().max(80).optional(),
  isLebanese: z.boolean().nullable().optional(),
  nationality1: z.string().trim().max(60).optional(),
  email: z.string().trim().max(160).optional(),
  phoneMobile: z.string().trim().max(40).optional(),
  phoneHome: z.string().trim().max(40).optional(),
  profession: z.string().trim().max(120).optional(),
  employer: z.string().trim().max(120).optional(),
});

export async function saveResponsable(
  applicationId: string,
  responsableId: string | null,
  payload: unknown,
): Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = responsableSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { ok: false, errors };
  }
  const d = parsed.data;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId, submittedByUserId: user.id },
      select: { id: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    const data = {
      kind: d.kind,
      civility: d.civility || null,
      firstName: d.firstName || null,
      lastName: d.lastName,
      firstNameAr: d.firstNameAr || null,
      lastNameAr: d.lastNameAr || null,
      isLebanese: d.isLebanese ?? null,
      nationality1: d.nationality1 || null,
      email: d.email || null,
      phoneMobile: d.phoneMobile || null,
      phoneHome: d.phoneHome || null,
      profession: d.profession || null,
      employer: d.employer || null,
    };

    if (responsableId) {
      const existing = await db.applicationResponsable.findUnique({
        where: { id: responsableId },
        select: { applicationId: true },
      });
      if (!existing || existing.applicationId !== applicationId) {
        return { ok: false, error: "not-found" };
      }
      await db.applicationResponsable.update({ where: { id: responsableId }, data });
    } else {
      const maxOrder = await db.applicationResponsable.aggregate({
        where: { applicationId },
        _max: { order: true },
      });
      await db.applicationResponsable.create({
        data: { tenantId, applicationId, order: (maxOrder._max.order ?? -1) + 1, ...data },
      });
    }
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

/**
 * Save a responsable's FULL parent-field answer set (the two-parent editor on
 * the Responsables tab). Answers are keyed by parent entity-field id and live
 * in ApplicationResponsable.customAnswers; kind = Père/Mère/Tuteur. Creates
 * the row when responsableId is null. firstName/lastName are mirrored from
 * the prenom/nom answers for the card title + acceptance bridge.
 */
/** Labels of the required parent fields a responsable left empty (incl. the
 *  name, which is always required even if not flagged in the config). Empty
 *  array ⇒ this responsable is complete. */
function missingResponsableFields(
  answers: Record<string, string>,
  parentConfig: EntityFieldsConfig,
): string[] {
  const missing: string[] = [];
  if (!(answers.nom && answers.nom.trim())) {
    missing.push(parentConfig.fields.find((f) => f.id === "nom")?.label ?? "Nom");
  }
  for (const f of parentConfig.fields) {
    if (f.id === "nom") continue; // handled above
    if (!f.required || !evaluateShowIf(f, answers)) continue;
    if ((answers[f.id]?.trim().length ?? 0) === 0) missing.push(f.label);
  }
  return missing;
}

/** A responsable's saved answers satisfy the required parent fields (+ a name). */
function responsableComplete(
  answers: Record<string, string>,
  parentConfig: EntityFieldsConfig,
): boolean {
  return missingResponsableFields(answers, parentConfig).length === 0;
}

/** Recompute the Responsables tab badge: complete when ≥1 saved responsable
 *  satisfies the required parent fields. */
async function refreshResponsablesCompletion(
  applicationId: string,
  tabsCompleted: unknown,
  tenantId: string,
): Promise<void> {
  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { parentFieldsConfig: true },
  });
  const cfg = parseEntityFieldsConfig(tenant?.parentFieldsConfig);
  const rows = await db.applicationResponsable.findMany({
    where: { applicationId },
    select: { customAnswers: true },
  });
  const anyComplete = rows.some((r) => {
    const ca = (r.customAnswers ?? {}) as Record<string, unknown>;
    const ans: Record<string, string> = {};
    for (const [k, v] of Object.entries(ca)) if (typeof v === "string") ans[k] = v;
    return responsableComplete(ans, cfg);
  });
  await db.application.update({
    where: { id: applicationId },
    data: { tabsCompleted: mergeTabsCompleted(tabsCompleted, "responsables", anyComplete) },
  });
}

export async function saveResponsableAnswers(
  applicationId: string,
  responsableId: string | null,
  payload: { kind: string; answers: Record<string, string> },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const kind = (["PERE", "MERE", "TUTEUR", "AUTRE"] as const).includes(
    payload.kind as "PERE" | "MERE" | "TUTEUR" | "AUTRE",
  )
    ? (payload.kind as "PERE" | "MERE" | "TUTEUR" | "AUTRE")
    : "AUTRE";

  // Keep only non-empty string answers.
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.answers ?? {})) {
    if (typeof v === "string" && v.trim()) answers[k] = v.trim();
  }
  const firstName = (answers.prenom ?? "").slice(0, 80) || null;
  const lastName = (answers.nom ?? "").slice(0, 80) || null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId, submittedByUserId: user.id },
      select: { id: true, status: true, tabsCompleted: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }
    const data = {
      kind,
      firstName,
      lastName,
      customAnswers: answers as Prisma.InputJsonValue,
    };
    if (responsableId) {
      const existing = await db.applicationResponsable.findUnique({
        where: { id: responsableId },
        select: { applicationId: true },
      });
      if (!existing || existing.applicationId !== applicationId) {
        return { ok: false, error: "not-found" };
      }
      await db.applicationResponsable.update({ where: { id: responsableId }, data });
    } else {
      const maxOrder = await db.applicationResponsable.aggregate({
        where: { applicationId },
        _max: { order: true },
      });
      await db.applicationResponsable.create({
        data: { tenantId, applicationId, order: (maxOrder._max.order ?? -1) + 1, ...data },
      });
    }
    await refreshResponsablesCompletion(applicationId, app.tabsCompleted, tenantId);
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

export async function deleteResponsable(
  applicationId: string,
  responsableId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId, submittedByUserId: user.id },
      select: { id: true, status: true, tabsCompleted: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }
    const existing = await db.applicationResponsable.findUnique({
      where: { id: responsableId },
      select: { applicationId: true },
    });
    if (!existing || existing.applicationId !== applicationId) {
      return { ok: false, error: "not-found" };
    }
    await db.applicationResponsable.delete({ where: { id: responsableId } });
    await refreshResponsablesCompletion(applicationId, app.tabsCompleted, tenantId);
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// ── Santé tab ────────────────────────────────────────────────────

const santeSchema = z.object({
  allergies: z.string().trim().max(2000).optional(),
  traitement: z.string().trim().max(2000).optional(),
  doctorName: z.string().trim().max(120).optional(),
  doctorPhone: z.string().trim().max(40).optional(),
  vaccinationsUpToDate: z.boolean().nullable().optional(),
  hasPai: z.boolean().nullable().optional(),
  paiDetails: z.string().trim().max(2000).optional(),
  diet: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function saveSanteTab(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = santeSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "validation" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await loadApplicationOwnedBy(applicationId, user.id);
    if (!app) return { ok: false, error: "not-found" };

    // Phase 4 — completion respects tenant overrides. Vaccinations + PAI
    // are required by default; admin can flip either to optional or
    // hide them entirely.
    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const need = (key: string) =>
      isFieldRequiredEffective(key, tenantFormConfig);
    let complete = true;
    if (
      need("sante.info.vaccinationsUpToDate") &&
      (parsed.data.vaccinationsUpToDate === undefined ||
        parsed.data.vaccinationsUpToDate === null)
    ) {
      complete = false;
    }
    if (
      complete &&
      need("sante.info.hasPai") &&
      (parsed.data.hasPai === undefined || parsed.data.hasPai === null)
    ) {
      complete = false;
    }

    await db.application.update({
      where: { id: applicationId },
      data: {
        dossierAnswers: mergeDossierAnswers(
          app.dossierAnswers,
          "sante",
          parsed.data as unknown as Record<string, unknown>,
        ),
        tabsCompleted: mergeTabsCompleted(app.tabsCompleted, "sante", complete),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// ── Finance tab ──────────────────────────────────────────────────

const financeSchema = z.object({
  acknowledgedReglementInterieur: z.boolean().optional(),
  acknowledgedReglementFinancier: z.boolean().optional(),
  acknowledgedDroitsEntreeMlf: z.boolean().optional(),
  comiteParents: z.boolean().nullable().optional(),
  caisseLbp: z.string().trim().max(40).optional(), // "3000000" | "6000000" | "9000000" | "none" | custom
  caisseLbpAutreAmount: z.string().trim().max(20).optional(),
  caisseUsd: z.string().trim().max(40).optional(),
  caisseUsdAutreAmount: z.string().trim().max(20).optional(),
});

export async function saveFinanceTab(
  applicationId: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = financeSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "validation" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await loadApplicationOwnedBy(applicationId, user.id);
    if (!app) return { ok: false, error: "not-found" };

    // Phase 4 — completion respects tenant overrides. Three acks +
    // comité are required by default; admin can flip any to optional
    // or hide. Caisse de solidarité stays optional in all cases.
    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const need = (key: string) =>
      isFieldRequiredEffective(key, tenantFormConfig);
    let complete = true;
    if (
      need("finance.reglements.ackInterieur") &&
      parsed.data.acknowledgedReglementInterieur !== true
    ) {
      complete = false;
    }
    if (
      complete &&
      need("finance.reglements.ackFinancier") &&
      parsed.data.acknowledgedReglementFinancier !== true
    ) {
      complete = false;
    }
    if (
      complete &&
      need("finance.droitsMlf.ack") &&
      parsed.data.acknowledgedDroitsEntreeMlf !== true
    ) {
      complete = false;
    }
    if (
      complete &&
      need("finance.comite.subscribe") &&
      (parsed.data.comiteParents === undefined ||
        parsed.data.comiteParents === null)
    ) {
      complete = false;
    }

    await db.application.update({
      where: { id: applicationId },
      data: {
        dossierAnswers: mergeDossierAnswers(
          app.dossierAnswers,
          "finance",
          parsed.data as unknown as Record<string, unknown>,
        ),
        tabsCompleted: mergeTabsCompleted(
          app.tabsCompleted,
          "finance",
          complete,
        ),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

// ── Validation tab ───────────────────────────────────────────────

export async function saveValidationAck(
  applicationId: string,
  acknowledged: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await loadApplicationOwnedBy(applicationId, user.id);
    if (!app) return { ok: false, error: "not-found" };

    const dossier =
      app.dossierAnswers && typeof app.dossierAnswers === "object"
        ? (app.dossierAnswers as Record<string, unknown>)
        : {};
    const validation = {
      ...(dossier.validation && typeof dossier.validation === "object"
        ? (dossier.validation as Record<string, unknown>)
        : {}),
      acknowledged,
    };

    // Phase 4 — if admin hides or marks-optional the ack field, the
    // validation tab passes regardless of the checkbox state.
    const tenantFormConfig = await loadInscriptionFormConfig(tenantId);
    const ackRequired = isFieldRequiredEffective(
      "validation.ack.acknowledged",
      tenantFormConfig,
    );
    const complete = ackRequired ? acknowledged : true;

    await db.application.update({
      where: { id: applicationId },
      data: {
        dossierAnswers: mergeDossierAnswers(app.dossierAnswers, "validation", validation),
        tabsCompleted: mergeTabsCompleted(
          app.tabsCompleted,
          "validation",
          complete,
        ),
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}
