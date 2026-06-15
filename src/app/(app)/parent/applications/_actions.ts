"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  Prisma,
  type ApplicationResponsable,
  type ApplicationContact,
} from "@prisma/client";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { COUNTRIES_FR } from "@/lib/lookups";
import { sendApplicationSubmittedEmail } from "@/lib/emails/notifications";
import { uploadDocument, deleteFromStorage } from "@/lib/storage";
import {
  fieldsForStep,
  getFieldVisibility,
  parseFieldConfig,
  validateAnswer,
  type CycleFieldConfig,
  type WizardStep,
} from "@/lib/admission-fields";

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

const startSchema = z.object({
  cycleId: z.string().min(1),
});

/**
 * Pull family / address fields from the parent's most-recent prior application,
 * if any. Used to pre-fill step 2 so siblings (and re-enrollments) don't force
 * the parent to re-type contact info they already gave us.
 *
 * Must be called INSIDE a `runWithTenant` block.
 */
async function getPriorFamilyInfo(userId: string) {
  return db.application.findFirst({
    where: { submittedByUserId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      primaryParentName: true,
      primaryParentPhone: true,
      primaryParentEmail: true,
      secondaryParentName: true,
      secondaryParentPhone: true,
      secondaryParentEmail: true,
      address: true,
      city: true,
      postalCode: true,
      country: true,
    },
  });
}

/** Recreate a responsable row onto a fresh application (renewal prefill). */
function copyResponsable(r: ApplicationResponsable, tenantId: string) {
  const { id, applicationId, createdAt, updatedAt, tenantId: _t, customAnswers, ...rest } = r;
  void id;
  void applicationId;
  void createdAt;
  void updatedAt;
  void _t;
  return { ...rest, tenantId, customAnswers: (customAnswers ?? {}) as Prisma.InputJsonValue };
}

/** Recreate a contact row onto a fresh application (renewal prefill). */
function copyContact(c: ApplicationContact, tenantId: string) {
  return {
    tenantId,
    kind: c.kind,
    order: c.order,
    firstName: c.firstName,
    lastName: c.lastName,
    relation: c.relation,
    photoUrl: c.photoUrl,
    phoneMobile: c.phoneMobile,
    phoneHome: c.phoneHome,
  };
}

/** Last year's transport / restauration from the student's stored
 *  registration — used to seed a renewal when there's no prior EduLM dossier
 *  (Dars-imported students). Returns null when nothing is known. */
function transportFromStudent(ca: Record<string, unknown>): Record<string, unknown> | null {
  const str = (k: string) => (typeof ca[k] === "string" ? (ca[k] as string) : "");
  let reg: Record<string, Record<string, string>> = {};
  let sby: Record<string, string> = {};
  try {
    reg = JSON.parse(str("registration_by_year") || "{}") as Record<string, Record<string, string>>;
  } catch {
    /* ignore */
  }
  try {
    sby = JSON.parse(str("services_by_year") || "{}") as Record<string, string>;
  } catch {
    /* ignore */
  }
  const regYears = Object.keys(reg).sort();
  const last = regYears.length ? (reg[regYears[regYears.length - 1]!] ?? {}) : {};
  const svcYears = Object.keys(sby).sort();
  const lastSvc = svcYears.length ? (sby[svcYears[svcYears.length - 1]!] ?? "") : "";

  const modeAller =
    last.transport_aller === "Avec bus" ? "bus" : last.transport_aller === "Avec parent" ? "parents" : "";
  const modeRetour =
    last.transport_retour === "Avec bus" ? "bus" : last.transport_retour === "Avec parent" ? "parents" : "";
  const collation = last.collations === "yes" || lastSvc.includes("Collation");
  const cantine = last.repas_chaud === "yes" || lastSvc.includes("Cantine");

  if (!modeAller && !modeRetour && !collation && !cantine && last.autocar == null) return null;
  return { modeAller, modeRetour, collation, cantine };
}

export async function startApplication(formData: FormData): Promise<void> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) redirect("/sign-in");

  const parsed = startSchema.safeParse({
    cycleId: String(formData.get("cycleId") ?? ""),
  });
  if (!parsed.success) redirect("/parent/applications/new");

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: parsed.data.cycleId },
      select: { id: true, isActive: true, closeAt: true },
    });
    if (!cycle || !cycle.isActive) return;
    if (cycle.closeAt && cycle.closeAt < new Date()) return;

    // Anti-duplicate: if the parent already has an empty new-application draft
    // for this cycle (no child name yet, not a renewal), resume it instead of
    // creating yet another empty draft. Catches accidental double-clicks and
    // parents who started but never filled in the form.
    const emptyDraft = await db.application.findFirst({
      where: {
        submittedByUserId: user.id,
        cycleId: cycle.id,
        status: "DRAFT",
        childFirstName: "",
        existingStudentId: null,
      },
      select: { id: true },
    });
    if (emptyDraft) {
      newId = emptyDraft.id;
      return;
    }

    // If this parent has applied before (any child), pre-fill family info from
    // the most recent application so siblings don't re-type the household data.
    const prior = await getPriorFamilyInfo(user.id);

    const created = await db.application.create({
      data: {
        tenantId,
        cycleId: cycle.id,
        submittedByUserId: user.id,
        status: "DRAFT",
        childFirstName: "",
        childLastName: "",
        primaryParentName: prior?.primaryParentName || user.name || "",
        primaryParentEmail: prior?.primaryParentEmail || user.email,
        primaryParentPhone: prior?.primaryParentPhone ?? null,
        secondaryParentName: prior?.secondaryParentName ?? null,
        secondaryParentPhone: prior?.secondaryParentPhone ?? null,
        secondaryParentEmail: prior?.secondaryParentEmail ?? null,
        address: prior?.address ?? null,
        city: prior?.city ?? null,
        postalCode: prior?.postalCode ?? null,
        country: prior?.country ?? null,
      },
      select: { id: true },
    });
    newId = created.id;
  });

  if (!newId) redirect("/parent/applications/new?error=cycle-closed");
  revalidatePath("/parent/applications");
  redirect(`/parent/applications/${newId}/edit`);
}

// ─── Step field validators (dynamic per cycle config) ───────
// Each field has a `base` validator (used when the cycle marks the field as
// optional) and a `required` variant (used when the cycle marks it required).
// Hidden fields are excluded from the schema entirely so they're neither
// validated nor written to the DB — preserves any existing value.

type FieldBuilder = { base: z.ZodTypeAny; required: z.ZodTypeAny };

const IDENTITY_FIELDS: Record<string, FieldBuilder> = {
  childFirstName: {
    base: z.string().trim().min(1).max(80),
    required: z.string().trim().min(1).max(80),
  },
  childLastName: {
    base: z.string().trim().min(1).max(80),
    required: z.string().trim().min(1).max(80),
  },
  childDob: {
    base: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
    required: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .transform((v) => new Date(`${v}T00:00:00.000Z`)),
  },
  childGender: {
    base: z.enum(GENDERS).optional().nullable(),
    required: z.enum(GENDERS),
  },
  childNationality: {
    base: z.string().trim().max(80).optional().nullable(),
    required: z.string().trim().min(1).max(80),
  },
  childPlaceOfBirth: {
    base: z.string().trim().max(120).optional().nullable(),
    required: z.string().trim().min(1).max(120),
  },
};

const FAMILY_FIELDS: Record<string, FieldBuilder> = {
  primaryParentName: {
    base: z.string().trim().min(1).max(120),
    required: z.string().trim().min(1).max(120),
  },
  primaryParentPhone: {
    base: z.string().trim().max(40).optional().nullable(),
    required: z.string().trim().min(1).max(40),
  },
  primaryParentEmail: {
    base: z.string().trim().max(200).optional().nullable(),
    required: z.string().trim().email().max(200),
  },
  secondaryParentName: {
    base: z.string().trim().max(120).optional().nullable(),
    required: z.string().trim().min(1).max(120),
  },
  secondaryParentPhone: {
    base: z.string().trim().max(40).optional().nullable(),
    required: z.string().trim().min(1).max(40),
  },
  secondaryParentEmail: {
    base: z.string().trim().max(200).optional().nullable(),
    required: z.string().trim().email().max(200),
  },
  address: {
    base: z.string().trim().max(200).optional().nullable(),
    required: z.string().trim().min(1).max(200),
  },
  city: {
    base: z.string().trim().max(80).optional().nullable(),
    required: z.string().trim().min(1).max(80),
  },
  postalCode: {
    base: z.string().trim().max(20).optional().nullable(),
    required: z.string().trim().min(1).max(20),
  },
  country: {
    base: z.string().trim().max(80).optional().nullable(),
    required: z.string().trim().min(1).max(80),
  },
};

const ACADEMIC_FIELDS: Record<string, FieldBuilder> = {
  currentSchool: {
    base: z.string().trim().max(160).optional().nullable(),
    required: z.string().trim().min(1).max(160),
  },
  currentLevel: {
    base: z.string().trim().max(80).optional().nullable(),
    required: z.string().trim().min(1).max(80),
  },
  requestedLevel: {
    base: z.string().trim().min(1).max(80),
    required: z.string().trim().min(1).max(80),
  },
  motivationNote: {
    base: z.string().trim().max(2000).optional().nullable(),
    required: z.string().trim().min(1).max(2000),
  },
};

const STEP_FIELDS: Record<WizardStep, Record<string, FieldBuilder>> = {
  identity: IDENTITY_FIELDS,
  family: FAMILY_FIELDS,
  academic: ACADEMIC_FIELDS,
};

function buildStepSchema(step: WizardStep, config: CycleFieldConfig) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fieldsForStep(step)) {
    const vis = getFieldVisibility(config, f.key);
    if (vis === "hidden") continue;
    const builder = STEP_FIELDS[step][f.key];
    if (!builder) continue;
    shape[f.key] = vis === "required" ? builder.required : builder.base;
  }
  return z.object(shape);
}

function visibleFieldKeys(
  step: WizardStep,
  config: CycleFieldConfig,
): string[] {
  return fieldsForStep(step)
    .filter((f) => getFieldVisibility(config, f.key) !== "hidden")
    .map((f) => f.key);
}

export type StepFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

function normalize(formData: FormData, keys: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) {
    const v = formData.get(k);
    out[k] = v === null ? undefined : String(v) || undefined;
  }
  return out;
}

async function ensureMine(id: string, tenantId: string, userId: string) {
  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id },
      select: {
        id: true,
        submittedByUserId: true,
        status: true,
        cycle: { select: { fieldConfig: true } },
      },
    });
    if (!app || app.submittedByUserId !== userId) return null;
    return app;
  });
}

function isEditable(status: string) {
  // Parents can edit while the application is still with them (DRAFT) or
  // SUBMITTED but no admin has started reviewing yet. Once it moves to
  // UNDER_REVIEW / INTERVIEW_SCHEDULED / final states, edits are locked.
  return status === "DRAFT" || status === "SUBMITTED";
}

export async function saveIdentityStep(
  id: string,
  _prev: StepFormState,
  formData: FormData,
): Promise<StepFormState> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };
  const owned = await ensureMine(id, tenantId, user.id);
  if (!owned) return { formError: "not-found" };
  if (!isEditable(owned.status)) return { formError: "locked" };

  const config = parseFieldConfig(owned.cycle.fieldConfig);
  const schema = buildStepSchema("identity", config);
  const raw = normalize(formData, visibleFieldKeys("identity", config));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.application.update({ where: { id }, data: parsed.data });
  });
  revalidatePath(`/parent/applications/${id}/edit`);
  redirect(`/parent/applications/${id}/edit?step=2`);
}

export async function saveFamilyStep(
  id: string,
  _prev: StepFormState,
  formData: FormData,
): Promise<StepFormState> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };
  const owned = await ensureMine(id, tenantId, user.id);
  if (!owned) return { formError: "not-found" };
  if (!isEditable(owned.status)) return { formError: "locked" };

  const config = parseFieldConfig(owned.cycle.fieldConfig);
  const schema = buildStepSchema("family", config);
  const raw = normalize(formData, visibleFieldKeys("family", config));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.application.update({ where: { id }, data: parsed.data });
  });
  revalidatePath(`/parent/applications/${id}/edit`);
  redirect(`/parent/applications/${id}/edit?step=3`);
}

export async function saveAcademicStep(
  id: string,
  _prev: StepFormState,
  formData: FormData,
): Promise<StepFormState> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };
  const owned = await ensureMine(id, tenantId, user.id);
  if (!owned) return { formError: "not-found" };
  if (!isEditable(owned.status)) return { formError: "locked" };

  const config = parseFieldConfig(owned.cycle.fieldConfig);
  const schema = buildStepSchema("academic", config);
  const raw = normalize(formData, visibleFieldKeys("academic", config));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  // Custom questions: validate each, collect answers to save.
  const questions = config.customQuestions ?? [];
  const answerErrors: Record<string, string> = {};
  const answersToSave: { questionId: string; value: string }[] = [];
  for (const q of questions) {
    const value = String(formData.get(`question:${q.id}`) ?? "").trim();
    const err = validateAnswer(q, value);
    if (err) {
      answerErrors[`question:${q.id}`] = err;
    } else if (value.length > 0) {
      answersToSave.push({ questionId: q.id, value });
    }
  }
  if (Object.keys(answerErrors).length > 0) {
    return { errors: answerErrors };
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.application.update({ where: { id }, data: parsed.data });

    // Sync answers: delete anything not in the new set (handles cleared
    // answers AND questions removed from the cycle), then upsert the rest.
    const keepIds = answersToSave.map((a) => a.questionId);
    await db.applicationAnswer.deleteMany({
      where: {
        applicationId: id,
        questionId: { notIn: keepIds.length > 0 ? keepIds : ["__none__"] },
      },
    });
    for (const a of answersToSave) {
      await db.applicationAnswer.upsert({
        where: {
          applicationId_questionId: {
            applicationId: id,
            questionId: a.questionId,
          },
        },
        create: {
          applicationId: id,
          questionId: a.questionId,
          value: a.value,
        },
        update: { value: a.value },
      });
    }
  });
  revalidatePath(`/parent/applications/${id}/edit`);
  redirect(`/parent/applications/${id}/edit?step=4`);
}

// ─── Required-document uploads (Round 4) ──────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type UploadResult =
  | { ok: true; documentId: string; filename: string }
  | { ok: false; error: string };

export async function uploadApplicationDocument(
  applicationId: string,
  requirementId: string,
  formData: FormData,
): Promise<UploadResult> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "unauthenticated" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no-file" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "too-large" };
  }

  const owned = await ensureMine(applicationId, tenantId, user.id);
  if (!owned) return { ok: false, error: "not-found" };
  if (!isEditable(owned.status)) return { ok: false, error: "locked" };

  // Verify the requirement still exists on the cycle config.
  const config = parseFieldConfig(owned.cycle.fieldConfig);
  const requirement = (config.requiredDocuments ?? []).find(
    (d) => d.id === requirementId,
  );
  if (!requirement) return { ok: false, error: "unknown-requirement" };

  let uploaded: { path: string; size: number; mimeType: string } | null = null;
  try {
    uploaded = await uploadDocument(tenantId, file);
  } catch {
    return { ok: false, error: "upload-failed" };
  }
  if (!uploaded) return { ok: false, error: "storage-not-configured" };

  // If replacing an existing upload, delete the old object from storage.
  let oldPath: string | null = null;
  const documentId = await runWithTenant({ tenantId, slug: null }, async () => {
    const existing = await db.applicationDocument.findUnique({
      where: {
        applicationId_requirementId: { applicationId, requirementId },
      },
      select: { id: true, storagePath: true },
    });
    if (existing) oldPath = existing.storagePath;

    const upserted = await db.applicationDocument.upsert({
      where: {
        applicationId_requirementId: { applicationId, requirementId },
      },
      create: {
        applicationId,
        requirementId,
        storagePath: uploaded!.path,
        filename: file.name,
        mimeType: uploaded!.mimeType,
        fileSizeBytes: uploaded!.size,
      },
      update: {
        storagePath: uploaded!.path,
        filename: file.name,
        mimeType: uploaded!.mimeType,
        fileSizeBytes: uploaded!.size,
      },
      select: { id: true },
    });
    return upserted.id;
  });

  if (oldPath) {
    await deleteFromStorage(oldPath).catch(() => {
      // Best-effort; orphaned storage is acceptable vs failing the request.
    });
  }

  revalidatePath(`/parent/applications/${applicationId}/edit`);
  return { ok: true, documentId, filename: file.name };
}

export async function deleteApplicationDocument(
  applicationId: string,
  requirementId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "unauthenticated" };

  const owned = await ensureMine(applicationId, tenantId, user.id);
  if (!owned) return { ok: false, error: "not-found" };
  if (!isEditable(owned.status)) return { ok: false, error: "locked" };

  const path = await runWithTenant({ tenantId, slug: null }, async () => {
    const existing = await db.applicationDocument.findUnique({
      where: {
        applicationId_requirementId: { applicationId, requirementId },
      },
      select: { storagePath: true },
    });
    if (!existing) return null;
    await db.applicationDocument.delete({
      where: {
        applicationId_requirementId: { applicationId, requirementId },
      },
    });
    return existing.storagePath;
  });

  if (path) {
    await deleteFromStorage(path).catch(() => {
      // Best-effort cleanup.
    });
  }

  revalidatePath(`/parent/applications/${applicationId}/edit`);
  return { ok: true };
}

export type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * Cancel (delete) a DRAFT application owned by the current user. Only drafts —
 * applications that have been submitted use the WITHDRAWN status for audit and
 * are handled by the admin tooling.
 *
 * Returns a result instead of redirecting so the client can show a toast and
 * navigate itself. This pattern works around server actions that redirect not
 * being able to surface success state to the caller.
 */
/**
 * Parent-initiated archive: hides the row from their default list.
 * Reversible — admin (or this same parent via "Show archived") can
 * restore it later. Always allowed regardless of status; archive is
 * just a personal hygiene flag.
 */
export async function parentArchiveApplication(
  id: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "unauthenticated" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id },
      select: { id: true, submittedByUserId: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id)
      return { ok: false, error: "forbidden" };
    await db.application.update({
      where: { id },
      data: {
        archived,
        archivedAt: archived ? new Date() : null,
        deletedAt: null,
      },
    });
    revalidatePath("/parent/applications");
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

/**
 * Parent-initiated soft delete: tombstones the row so it disappears
 * from their list. Admin can still see it in "Supprimés" and either
 * restore it or purge it permanently. Same owner check as
 * cancelDraftApplication — no status restriction since this is just
 * a hide-from-my-view, not a true cancellation.
 */
export async function parentSoftDeleteApplication(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "unauthenticated" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id },
      select: { id: true, submittedByUserId: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id)
      return { ok: false, error: "forbidden" };
    await db.application.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/parent/applications");
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

export async function cancelDraftApplication(
  id: string,
): Promise<CancelResult> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "unauthenticated" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id)
      return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT") return { ok: false, error: "not-draft" };
    await db.application.delete({ where: { id } });

    revalidatePath("/parent/applications");
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

export async function submitApplication(id: string) {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return;

  let notifyContext: {
    childFirstName: string;
    childLastName: string;
    requestedLevel: string | null;
    applicationId: string;
  } | null = null;

  await runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id },
      select: {
        id: true,
        submittedByUserId: true,
        status: true,
        childFirstName: true,
        childLastName: true,
        requestedLevel: true,
        cycle: { select: { fieldConfig: true } },
        documents: { select: { requirementId: true } },
      },
    });
    if (!app || app.submittedByUserId !== user.id) return;
    if (app.status !== "DRAFT") return;
    if (!app.childFirstName || !app.childLastName || !app.requestedLevel) return;
    // Block submit if any required-document slot is still empty.
    const cfg = parseFieldConfig(app.cycle.fieldConfig);
    const missingRequired = (cfg.requiredDocuments ?? []).filter(
      (r) => r.required && !app.documents.some((d) => d.requirementId === r.id),
    );
    if (missingRequired.length > 0) return;
    await db.application.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    notifyContext = {
      childFirstName: app.childFirstName,
      childLastName: app.childLastName,
      requestedLevel: app.requestedLevel,
      applicationId: app.id,
    };
  });

  // Best-effort admin notification — never blocks the submit.
  if (notifyContext) {
    notifyAdminsOfSubmission(tenantId, user.name ?? user.email, notifyContext).catch((e) =>
      console.error("[email] applicationSubmitted notify failed:", e),
    );
  }

  revalidatePath("/parent/applications");
  revalidatePath(`/parent/applications/${id}`);
  redirect(`/parent/applications/${id}`);
}

async function notifyAdminsOfSubmission(
  tenantId: string,
  submittedByName: string,
  ctx: {
    childFirstName: string;
    childLastName: string;
    requestedLevel: string | null;
    applicationId: string;
  },
) {
  // Use the unscoped client — we're sending email AFTER the runWithTenant block
  // has exited, so the AsyncLocalStorage context is no longer set.
  const u = unscopedDb();
      const tenant = await u.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const admins = await u.user.findMany({
      where: { tenantId, role: "SCHOOL_ADMIN", status: "ACTIVE" },
      select: { email: true, name: true },
    });
    if (!tenant || admins.length === 0) return;
    await sendApplicationSubmittedEmail({
      to: admins,
      tenantName: tenant.name,
      childFirstName: ctx.childFirstName,
      childLastName: ctx.childLastName,
      requestedLevel: ctx.requestedLevel,
      submittedByName,
      applicationId: ctx.applicationId,
    });
}

/**
 * Start a renewal application for an existing child. Looks up the student +
 * guardian + most-recent enrollment to pre-fill the dossier. Idempotent —
 * if a draft renewal already exists for (cycle, student), reuses it.
 */
export async function startRenewal(formData: FormData): Promise<void> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) redirect("/sign-in");

  const studentId = String(formData.get("studentId") ?? "");
  const cycleId = String(formData.get("cycleId") ?? "");
  if (!studentId || !cycleId) redirect("/parent/dashboard");

  let appId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Verify the parent owns this student via guardian link.
    const guardian = await db.guardian.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!guardian) return;
    const link = await db.studentGuardian.findFirst({
      where: { guardianId: guardian.id, studentId },
    });
    if (!link) return;

    // Verify cycle is open.
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, isActive: true, closeAt: true },
    });
    if (!cycle || !cycle.isActive) return;
    if (cycle.closeAt && cycle.closeAt < new Date()) return;

    // Reuse an existing draft / non-final app if any (idempotent).
    const existing = await db.application.findFirst({
      where: { cycleId, existingStudentId: studentId },
      select: { id: true },
    });
    if (existing) {
      appId = existing.id;
      return;
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        dob: true,
        gender: true,
        nationality: true,
        placeOfBirth: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        customAnswers: true,
        enrollments: {
          orderBy: { enrolledAt: "desc" },
          take: 1,
          select: { class: { select: { level: true, name: true } } },
        },
        family: {
          select: {
            students: {
              where: { status: "ENROLLED" },
              select: {
                id: true,
                firstName: true,
                dob: true,
                enrollments: {
                  orderBy: { enrolledAt: "desc" },
                  take: 1,
                  select: { class: { select: { name: true } } },
                },
              },
            },
          },
        },
        guardianLinks: {
          include: {
            guardian: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    customAnswers: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!student) return;

    const tenantRow = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const schoolName = tenantRow?.name ?? "";

    const primaryGuardian = student.guardianLinks[0]?.guardian.user;
    // Relation of the parent doing the renewal (père / mère / tuteur), so the
    // Responsables tab shows it instead of a blank.
    const submitterRelation =
      student.guardianLinks.find(
        (l) => l.guardian.user.email === user.email,
      )?.guardian.relation ??
      student.guardianLinks.find((l) => l.isPrimary)?.guardian.relation ??
      null;

    // Richest prefill source: the most-recent prior dossier for THIS child —
    // the application that first enrolled them, or last year's renewal. On a
    // renewal almost nothing changes, so we carry the whole dossier over.
    const priorApp = await db.application.findFirst({
      where: {
        OR: [{ existingStudentId: studentId }, { resultingStudentId: studentId }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        responsables: { orderBy: { order: "asc" } },
        contacts: { orderBy: { order: "asc" } },
        siblings: { orderBy: { order: "asc" } },
      },
    });

    // Family contact columns from the most-recent application of this parent.
    const prior = await getPriorFamilyInfo(user.id);

    // Dars-imported students have NO prior EduLM dossier — fall back to their
    // customAnswers (identity + last year's transport/meals).
    const ca = (student.customAnswers ?? {}) as Record<string, unknown>;
    const caStr = (k: string) => (typeof ca[k] === "string" ? (ca[k] as string) : "");
    // Lebanese Oui/Non — derive from the stored flag or a "Libanaise"
    // nationality so the parent doesn't have to answer it again.
    const lebanese =
      ca.isLebanese === true ||
      ca.isLebanese === "yes" ||
      ca.isLebanese === "true" ||
      /liban/i.test(caStr("nationalite")) ||
      /liban/i.test(caStr("nationalite2"));
    // Match the Dars birth-country casing ("AUSTRALIE") to the dropdown
    // option ("Australie") so it shows selected.
    const normCountry = (v: string): string => {
      const hit = COUNTRIES_FR.find((c) => c.toLowerCase() === v.toLowerCase());
      return hit ?? v;
    };

    // Siblings: the family's other enrolled children (this school), merged
    // with any external-school siblings from the prior dossier (deduped by
    // first name). Gives the parent a ready list to confirm.
    const derivedSiblings = (student.family?.students ?? [])
      .filter((sib) => sib.id !== studentId)
      .map((sib) => ({
        firstName: sib.firstName,
        birthYear: sib.dob ? sib.dob.getFullYear() : null,
        className: sib.enrollments[0]?.class.name ?? null,
        schoolName,
      }));
    const seenSib = new Set<string>();
    const siblingRows = [
      ...(priorApp?.siblings ?? []).map((s) => ({
        firstName: s.firstName,
        birthYear: s.birthYear,
        className: s.className,
        schoolName: s.schoolName,
      })),
      ...derivedSiblings,
    ].filter((s) => {
      const k = s.firstName.trim().toLowerCase();
      if (!k || seenSib.has(k)) return false;
      seenSib.add(k);
      return true;
    });

    // Responsables: copy the prior dossier's rows if any; otherwise build
    // père + mère from the family's guardians so both show prefilled.
    const relKind: Record<string, "PERE" | "MERE" | "TUTEUR" | "AUTRE"> = {
      pere: "PERE",
      "père": "PERE",
      mere: "MERE",
      "mère": "MERE",
      tuteur: "TUTEUR",
      parent: "AUTRE",
    };
    const guardianResponsables =
      priorApp && priorApp.responsables.length
        ? []
        : student.guardianLinks.map((l, idx) => {
            const u = l.guardian.user;
            const pca = (u.customAnswers ?? {}) as Record<string, unknown>;
            const ps = (k: string) => (typeof pca[k] === "string" ? (pca[k] as string) : "");
            let fn = u.firstName ?? "";
            let ln = u.lastName ?? "";
            if (!fn && !ln && u.name) {
              const parts = u.name.trim().split(/\s+/);
              ln = parts.length > 1 ? (parts[parts.length - 1] ?? "") : (parts[0] ?? "");
              fn = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
            }
            const firstPhone = ps("telephones").split(/[,;/]/)[0]?.trim() ?? "";
            const realEmail = u.email && !/@import\./i.test(u.email) ? u.email : "";
            return {
              tenantId,
              order: idx,
              kind: relKind[(l.guardian.relation ?? "").toLowerCase()] ?? "AUTRE",
              firstName: fn || null,
              lastName: ln || null,
              firstNameAr: ps("prenom_ar") || null,
              lastNameAr: ps("nom_ar") || null,
              nationality1: ps("nationalite") || null,
              email: realEmail || null,
              phoneMobile: firstPhone || null,
              profession: ps("profession") || null,
              employer: ps("societe") || null,
            };
          });

    // dossierAnswers: copy the prior dossier wholesale (foyer extras,
    // transport, santé…); else seed transport/meals from last registration.
    let dossierAnswers: Record<string, unknown> | undefined;
    if (priorApp?.dossierAnswers && typeof priorApp.dossierAnswers === "object") {
      dossierAnswers = priorApp.dossierAnswers as Record<string, unknown>;
    } else {
      const t = transportFromStudent(ca);
      if (t) dossierAnswers = { transport: t };
    }

    const created = await db.application.create({
      data: {
        tenantId,
        cycleId,
        submittedByUserId: user.id,
        existingStudentId: studentId,
        status: "DRAFT",
        // ── Child identity: prior app → Student column → Dars customAnswers ──
        childFirstName: student.firstName,
        childLastName: student.lastName,
        childDob: student.dob,
        childGender: priorApp?.childGender ?? student.gender ?? null,
        childPlaceOfBirth:
          priorApp?.childPlaceOfBirth ?? student.placeOfBirth ?? (caStr("lieu_naissance") || null),
        childBirthCountry:
          priorApp?.childBirthCountry ??
          (caStr("pays_naissance") ? normCountry(caStr("pays_naissance")) : null),
        childNationality:
          priorApp?.childNationality ?? student.nationality ?? (caStr("nationalite") || null),
        childNationality2: priorApp?.childNationality2 ?? (caStr("nationalite2") || null),
        childFirstNameAr: priorApp?.childFirstNameAr ?? null,
        childLastNameAr: priorApp?.childLastNameAr ?? null,
        childIsLebanese: priorApp?.childIsLebanese ?? (lebanese ? true : null),
        childPassportLebanese: priorApp?.childPassportLebanese ?? null,
        // ── Responsable identity carried from the prior dossier ──
        submitterRelation: priorApp?.submitterRelation ?? submitterRelation,
        submitterIsLebanese: priorApp?.submitterIsLebanese ?? null,
        submitterPassportLebanese: priorApp?.submitterPassportLebanese ?? null,
        submitterNationality: priorApp?.submitterNationality ?? null,
        submitterNationality2: priorApp?.submitterNationality2 ?? null,
        monoParental: priorApp?.monoParental ?? false,
        // ── Custom answers + dossier carried over ──
        ...(priorApp?.parentAnswers != null
          ? { parentAnswers: priorApp.parentAnswers as Prisma.InputJsonValue }
          : {}),
        ...(priorApp?.studentAnswers != null
          ? { studentAnswers: priorApp.studentAnswers as Prisma.InputJsonValue }
          : {}),
        ...(dossierAnswers != null
          ? { dossierAnswers: dossierAnswers as Prisma.InputJsonValue }
          : {}),
        // Carry the prior tab-completion so the renewal opens review-ready
        // (everything prefilled) rather than "À COMPLÉTER" on every tab.
        ...(priorApp?.tabsCompleted != null
          ? { tabsCompleted: priorApp.tabsCompleted as Prisma.InputJsonValue }
          : {}),
        // ── Family contact ──
        primaryParentName:
          prior?.primaryParentName || primaryGuardian?.name || user.name || "",
        primaryParentEmail:
          prior?.primaryParentEmail || primaryGuardian?.email || user.email,
        primaryParentPhone: prior?.primaryParentPhone ?? null,
        secondaryParentName: prior?.secondaryParentName ?? null,
        secondaryParentPhone: prior?.secondaryParentPhone ?? null,
        secondaryParentEmail: prior?.secondaryParentEmail ?? null,
        address: prior?.address ?? student.address ?? null,
        city: prior?.city ?? student.city ?? null,
        postalCode: prior?.postalCode ?? student.postalCode ?? null,
        country: prior?.country ?? student.country ?? null,
        currentLevel: student.enrollments[0]?.class.level ?? null,
        // ── Sub-rows recreated from the prior dossier ──
        ...(priorApp && priorApp.responsables.length
          ? { responsables: { create: priorApp.responsables.map((r) => copyResponsable(r, tenantId)) } }
          : guardianResponsables.length
            ? { responsables: { create: guardianResponsables } }
            : {}),
        ...(priorApp && priorApp.contacts.length
          ? { contacts: { create: priorApp.contacts.map((c) => copyContact(c, tenantId)) } }
          : {}),
        ...(siblingRows.length
          ? {
              siblings: {
                create: siblingRows.map((s, idx) => ({
                  tenantId,
                  order: idx,
                  firstName: s.firstName,
                  birthYear: s.birthYear,
                  className: s.className,
                  schoolName: s.schoolName,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });
    appId = created.id;
  });

  if (!appId) redirect("/parent/dashboard");
  revalidatePath("/parent/applications");
  redirect(`/parent/applications/${appId}/edit`);
}
