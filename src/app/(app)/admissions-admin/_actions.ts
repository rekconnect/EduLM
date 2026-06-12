"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { decimalStringToCents } from "@/lib/money";
import { sendApplicationDecidedEmail } from "@/lib/emails/notifications";
import { linkStudentToGuardianFamily } from "@/lib/family";
import { applyDossierToStudent } from "./_apply-dossier";

// ── Admission cycle CRUD ────────────────────────────────────

const cycleSchema = z.object({
  label: z.string().trim().min(1).max(120),
  targetYearLabel: z.string().trim().min(1).max(40),
  openAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closeAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // First day of school for this cycle's target year (e.g. 2026-09-01).
  // Pre-fills the parent's "Date d'entrée souhaitée".
  schoolStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inscriptionFee: z.string().optional(),
  currency: z.string().trim().length(3),
  description: z.string().max(1000).optional(),
  isActive: z.string().optional().transform((v) => v === "on" || v === "true"),
  copyFromCycleId: z.string().trim().min(1).optional(),
});

export type CycleFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

export async function createCycle(
  _prev: CycleFormState,
  formData: FormData,
): Promise<CycleFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = cycleSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    targetYearLabel: String(formData.get("targetYearLabel") ?? ""),
    openAt: String(formData.get("openAt") ?? ""),
    closeAt: String(formData.get("closeAt") ?? "") || undefined,
    schoolStartDate:
      String(formData.get("schoolStartDate") ?? "") || undefined,
    inscriptionFee: String(formData.get("inscriptionFee") ?? "") || undefined,
    currency: String(formData.get("currency") ?? "USD").toUpperCase(),
    description: String(formData.get("description") ?? "") || undefined,
    isActive: String(formData.get("isActive") ?? ""),
    copyFromCycleId: String(formData.get("copyFromCycleId") ?? "") || undefined,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  const feeCents = parsed.data.inscriptionFee ? decimalStringToCents(parsed.data.inscriptionFee) : 0;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // If admin chose to clone, fetch the source fieldConfig within the same
    // tenant. Tenant scoping is already enforced by the runWithTenant wrapper.
    let initialFieldConfig: Record<string, unknown> = {};
    if (parsed.data.copyFromCycleId) {
      const src = await db.admissionCycle.findUnique({
        where: { id: parsed.data.copyFromCycleId },
        select: { fieldConfig: true },
      });
      if (src) {
        // Reparse + serialize via parseFieldConfig to drop any stray keys.
        initialFieldConfig = parseFieldConfig(src.fieldConfig) as unknown as Record<string, unknown>;
      }
    }
    await db.admissionCycle.create({
      data: {
        tenantId,
        label: parsed.data.label,
        targetYearLabel: parsed.data.targetYearLabel,
        openAt: new Date(`${parsed.data.openAt}T00:00:00.000Z`),
        closeAt: parsed.data.closeAt ? new Date(`${parsed.data.closeAt}T23:59:59.000Z`) : null,
        schoolStartDate: parsed.data.schoolStartDate
          ? new Date(`${parsed.data.schoolStartDate}T00:00:00.000Z`)
          : null,
        inscriptionFeeCents: feeCents ?? 0,
        currency: parsed.data.currency,
        description: parsed.data.description ?? null,
        isActive: parsed.data.isActive,
        fieldConfig: initialFieldConfig,
      },
    });
  });
  revalidatePath("/admissions-admin/cycles");
  redirect("/admissions-admin/cycles");
}

/**
 * Update an existing cycle's basic metadata (label, dates, fee, active flag).
 * Field-config edits are handled by the separate update*FieldConfig actions —
 * this one is purely for the top-of-page "Informations générales" form.
 */
export async function updateCycle(
  cycleId: string,
  _prev: CycleFormState,
  formData: FormData,
): Promise<CycleFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = cycleSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    targetYearLabel: String(formData.get("targetYearLabel") ?? ""),
    openAt: String(formData.get("openAt") ?? ""),
    closeAt: String(formData.get("closeAt") ?? "") || undefined,
    schoolStartDate:
      String(formData.get("schoolStartDate") ?? "") || undefined,
    inscriptionFee: String(formData.get("inscriptionFee") ?? "") || undefined,
    currency: String(formData.get("currency") ?? "USD").toUpperCase(),
    description: String(formData.get("description") ?? "") || undefined,
    isActive: String(formData.get("isActive") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  const feeCents = parsed.data.inscriptionFee
    ? decimalStringToCents(parsed.data.inscriptionFee)
    : 0;

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.admissionCycle.update({
      where: { id: cycleId },
      data: {
        label: parsed.data.label,
        targetYearLabel: parsed.data.targetYearLabel,
        openAt: new Date(`${parsed.data.openAt}T00:00:00.000Z`),
        closeAt: parsed.data.closeAt
          ? new Date(`${parsed.data.closeAt}T23:59:59.000Z`)
          : null,
        schoolStartDate: parsed.data.schoolStartDate
          ? new Date(`${parsed.data.schoolStartDate}T00:00:00.000Z`)
          : null,
        inscriptionFeeCents: feeCents ?? 0,
        currency: parsed.data.currency,
        description: parsed.data.description ?? null,
        isActive: parsed.data.isActive,
      },
    });
  });
  revalidatePath("/admissions-admin/cycles");
  revalidatePath(`/admissions-admin/cycles/${cycleId}`);
  return {};
}

/**
 * Delete an admission cycle and everything that hangs off it
 * (Application rows + their answers / documents / contacts / siblings
 * cascade via FK). Refuses if a) cycle doesn't belong to this admin's
 * tenant, or b) any of its applications already produced a Student
 * (acceptance) — those need manual unlinking first to avoid orphaning
 * a real kid.
 */
export async function deleteCycle(
  cycleId: string,
): Promise<{ ok: boolean; error?: string; producedStudentCount?: number }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        _count: { select: { applications: true } },
      },
    });
    if (!cycle) return { ok: false, error: "not-found" };

    // Guard: refuse if any application has already produced a student.
    // Cascading the delete would wipe the audit trail of accepted kids.
    const producedStudent = await db.application.count({
      where: { cycleId, resultingStudentId: { not: null } },
    });
    if (producedStudent > 0) {
      return {
        ok: false,
        error: "produced-students",
        producedStudentCount: producedStudent,
      };
    }

    await db.admissionCycle.delete({ where: { id: cycleId } });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath("/admissions-admin");
    return { ok: true };
  });
}

// ── Cycle field-config (per-cycle wizard customization) ────

import {
  ADMISSION_FIELDS,
  QUESTION_TYPES,
  WIZARD_STEPS,
  fieldsForStep,
  parseFieldConfig,
  type CustomQuestion,
  type CycleFieldConfig,
  type FieldVisibility,
  type RequiredDocument,
  type WizardStep,
} from "@/lib/admission-fields";

const visibilityValues = ["required", "optional", "hidden"] as const;

const fieldConfigSchema = z.object({
  fields: z.record(z.string(), z.enum(visibilityValues)).optional(),
});

export async function updateCycleFieldConfig(
  cycleId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  // Collect `field:<key>` form entries into a Record<string, FieldVisibility>.
  const fields: Record<string, FieldVisibility> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("field:")) continue;
    const key = k.slice("field:".length);
    const def = ADMISSION_FIELDS.find((f) => f.key === key);
    if (!def || def.locked) continue; // ignore unknown or locked fields
    const value = String(v);
    if (!(visibilityValues as readonly string[]).includes(value)) continue;
    // Only persist non-default values; default cleans up the JSON blob.
    if (value !== def.default) {
      fields[key] = value as FieldVisibility;
    }
  }

  const parsed = fieldConfigSchema.safeParse({ fields });
  if (!parsed.success) return { error: "validation" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fieldConfig: true },
    });
    if (!cycle) return { error: "not-found" };

    const next = {
      ...((cycle.fieldConfig ?? {}) as Record<string, unknown>),
      fields: parsed.data.fields ?? {},
    };

    await db.admissionCycle.update({
      where: { id: cycleId },
      data: { fieldConfig: next },
    });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath(`/admissions-admin/cycles/${cycleId}`);
    return {};
  });
}

// ── Cycle custom questions (Round 3) ────────────────────────

const customQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1).max(200),
  hint: z.string().trim().max(300).optional(),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});

export async function updateCycleCustomQuestions(
  cycleId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  const raw = String(formData.get("questions") ?? "[]");
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    return { error: "invalid-json" };
  }
  if (!Array.isArray(parsedRaw)) return { error: "invalid-shape" };

  const validQuestions: CustomQuestion[] = [];
  for (const q of parsedRaw) {
    const parsed = customQuestionSchema.safeParse(q);
    if (!parsed.success) continue;
    // For non-select types, strip options to keep the JSON clean.
    if (parsed.data.type !== "select") {
      const { options: _options, ...rest } = parsed.data;
      validQuestions.push(rest as CustomQuestion);
    } else {
      validQuestions.push({
        ...parsed.data,
        options: parsed.data.options ?? [],
      });
    }
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fieldConfig: true },
    });
    if (!cycle) return { error: "not-found" };

    const next = {
      ...((cycle.fieldConfig ?? {}) as Record<string, unknown>),
      customQuestions: validQuestions,
    };

    await db.admissionCycle.update({
      where: { id: cycleId },
      data: { fieldConfig: next },
    });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath(`/admissions-admin/cycles/${cycleId}`);
    return {};
  });
}

// ── Cycle required documents (Round 4) ──────────────────────

const requiredDocSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  hint: z.string().trim().max(300).optional(),
  required: z.boolean(),
  acceptedTypes: z.string().trim().max(500).optional(),
});

export async function updateCycleRequiredDocuments(
  cycleId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  const raw = String(formData.get("documents") ?? "[]");
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    return { error: "invalid-json" };
  }
  if (!Array.isArray(parsedRaw)) return { error: "invalid-shape" };

  const validDocs: RequiredDocument[] = [];
  for (const d of parsedRaw) {
    const parsed = requiredDocSchema.safeParse(d);
    if (!parsed.success) continue;
    validDocs.push(parsed.data as RequiredDocument);
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fieldConfig: true },
    });
    if (!cycle) return { error: "not-found" };

    const next = {
      ...((cycle.fieldConfig ?? {}) as Record<string, unknown>),
      requiredDocuments: validDocs,
    };

    await db.admissionCycle.update({
      where: { id: cycleId },
      data: { fieldConfig: next },
    });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath(`/admissions-admin/cycles/${cycleId}`);
    return {};
  });
}

// ── Cycle labels & step intros & order (Round 5) ────────────

export async function updateCycleLabelsAndIntros(
  cycleId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  const customLabels: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("label:")) continue;
    const key = k.slice("label:".length);
    const def = ADMISSION_FIELDS.find((f) => f.key === key);
    if (!def) continue;
    const value = String(v).trim();
    if (value.length === 0) continue;
    if (value.length > 120) return { error: "label-too-long" };
    customLabels[key] = value;
  }

  const stepIntros: Partial<Record<WizardStep, string>> = {};
  for (const step of WIZARD_STEPS) {
    const raw = String(formData.get(`intro:${step}`) ?? "").trim();
    if (raw.length === 0) continue;
    if (raw.length > 1000) return { error: "intro-too-long" };
    stepIntros[step] = raw;
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fieldConfig: true },
    });
    if (!cycle) return { error: "not-found" };

    const next = {
      ...((cycle.fieldConfig ?? {}) as Record<string, unknown>),
      customLabels,
      stepIntros,
    };

    await db.admissionCycle.update({
      where: { id: cycleId },
      data: { fieldConfig: next },
    });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath(`/admissions-admin/cycles/${cycleId}`);
    return {};
  });
}

export async function updateCycleFieldOrder(
  cycleId: string,
  order: Partial<Record<WizardStep, string[]>>,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  const cleaned: Partial<Record<WizardStep, string[]>> = {};
  for (const step of WIZARD_STEPS) {
    const list = order[step];
    if (!Array.isArray(list)) continue;
    const allowed = new Set(fieldsForStep(step).map((f) => f.key));
    const seen = new Set<string>();
    const next: string[] = [];
    for (const k of list) {
      if (typeof k !== "string") continue;
      if (!allowed.has(k)) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      next.push(k);
    }
    if (next.length > 0) cleaned[step] = next;
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const cycle = await db.admissionCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, fieldConfig: true },
    });
    if (!cycle) return { error: "not-found" };

    const next = {
      ...((cycle.fieldConfig ?? {}) as Record<string, unknown>),
      fieldOrder: cleaned,
    };

    await db.admissionCycle.update({
      where: { id: cycleId },
      data: { fieldConfig: next },
    });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath(`/admissions-admin/cycles/${cycleId}`);
    return {};
  });
}

// ── Cycle copy-from (Round 5-F) ─────────────────────────────

export async function copyCycleConfig(
  fromCycleId: string,
  toCycleId: string,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  if (fromCycleId === toCycleId) return { error: "same-cycle" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [from, to] = await Promise.all([
      db.admissionCycle.findUnique({
        where: { id: fromCycleId },
        select: { id: true, fieldConfig: true },
      }),
      db.admissionCycle.findUnique({
        where: { id: toCycleId },
        select: { id: true },
      }),
    ]);
    if (!from || !to) return { error: "not-found" };

    // Reparse to ensure shape sanity, then persist.
    const parsed: CycleFieldConfig = parseFieldConfig(from.fieldConfig);
    await db.admissionCycle.update({
      where: { id: toCycleId },
      data: { fieldConfig: parsed as unknown as Record<string, unknown> },
    });
    revalidatePath("/admissions-admin/cycles");
    revalidatePath(`/admissions-admin/cycles/${toCycleId}`);
    return {};
  });
}

// ── Application decisions ────────────────────────────────────

const decisionSchema = z.object({
  decision: z.enum(["ACCEPTED", "DECLINED", "WAITLISTED", "UNDER_REVIEW", "INTERVIEW_SCHEDULED"]),
  decisionNote: z.string().max(2000).optional(),
  classId: z.string().optional(), // required only when decision = ACCEPTED
});

export async function decideApplication(
  applicationId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  const parsed = decisionSchema.safeParse({
    decision: String(formData.get("decision") ?? ""),
    decisionNote: String(formData.get("decisionNote") ?? "") || undefined,
    classId: String(formData.get("classId") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "validation" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        cycle: { select: { targetYearLabel: true } },
        submittedBy: { select: { id: true, email: true, name: true } },
        contacts: {
          select: {
            kind: true,
            firstName: true,
            lastName: true,
            relation: true,
            phoneMobile: true,
            phoneHome: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!app) return { error: "not-found" };

    const now = new Date();
    const isFinal = ["ACCEPTED", "DECLINED", "WAITLISTED"].includes(parsed.data.decision);

    if (parsed.data.decision === "ACCEPTED") {
      if (!parsed.data.classId) return { error: "class-required" };

      // VALIDATE FIRST — no writes until everything passes. This prevents
      // orphan Student/Guardian rows when something fails mid-way.
      const klass = await db.class.findUnique({
        where: { id: parsed.data.classId },
        select: {
          id: true,
          academicYearId: true,
          academicYear: { select: { label: true } },
        },
      });
      if (!klass) return { error: "class-not-found" };
      if (klass.academicYear.label !== app.cycle.targetYearLabel) {
        return { error: "class-wrong-year" };
      }

      const isRenewal = !!app.existingStudentId;

      // Look up existing guardian (if any) BEFORE writes, so we can decide
      // inside the transaction whether to create one.
      const existingGuardian = await db.guardian.findUnique({
        where: { userId: app.submittedByUserId },
        select: { id: true },
      });

      // Now do all the writes in a single transaction. If anything throws,
      // Prisma rolls back — no orphan Student rows, no half-accepted apps.
      try {
        let newGuardianForFamily: string | null = null;
        let newStudentForFamily: string | null = null;

        await db.$transaction(async (tx) => {
          let studentId: string;

          if (isRenewal) {
            studentId = app.existingStudentId!;
          } else {
            const guardianId =
              existingGuardian?.id ??
              (
                await tx.guardian.create({
                  data: { tenantId, userId: app.submittedByUserId, relation: "parent" },
                  select: { id: true },
                })
              ).id;

            const student = await tx.student.create({
              data: {
                tenantId,
                firstName: app.childFirstName,
                lastName: app.childLastName,
                dob: app.childDob,
                gender: app.childGender,
                nationality: app.childNationality,
                placeOfBirth: app.childPlaceOfBirth,
                address: app.address,
                city: app.city,
                postalCode: app.postalCode,
                country: app.country,
                previousSchool: app.currentSchool,
                internalNotes: app.internalNotes,
                status: "ENROLLED",
              },
              select: { id: true },
            });
            await tx.studentGuardian.create({
              data: { studentId: student.id, guardianId, isPrimary: true },
            });
            studentId = student.id;
            // Remember the freshly-created IDs so we can wire them into a
            // Family record AFTER the transaction commits. (Family helpers run
            // their own transaction; nesting Prisma transactions deadlocks.)
            newGuardianForFamily = guardianId;
            newStudentForFamily = studentId;
          }

          await tx.enrollment.upsert({
            where: {
              studentId_academicYearId: {
                studentId,
                academicYearId: klass.academicYearId,
              },
            },
            update: { classId: klass.id },
            create: {
              tenantId,
              studentId,
              classId: klass.id,
              academicYearId: klass.academicYearId,
            },
          });

          // FIELD MATCHING — pour the online dossier into the student record
          // for the cycle's target year (transport, restauration, santé,
          // custom fields, personnes autorisées). Works for any future
          // cycle/year, not just 2026-2027.
          // The tenant-scoped client's tx is structurally a TransactionClient;
          // the extension wrapper just hides that from the type system.
          await applyDossierToStudent(tx as unknown as Parameters<typeof applyDossierToStudent>[0], {
            tenantId,
            studentId,
            yearLabel: app.cycle.targetYearLabel,
            dossierAnswers: app.dossierAnswers,
            studentAnswers: app.studentAnswers,
            parentAnswers: app.parentAnswers,
            submittedByUserId: app.submittedByUserId,
            contacts: app.contacts,
          });

          await tx.application.update({
            where: { id: applicationId },
            data: {
              status: "ACCEPTED",
              decisionAt: now,
              decisionNote: parsed.data.decisionNote ?? null,
              reviewedAt: app.reviewedAt ?? now,
              reviewedByUserId: user.id,
              resultingStudentId: isRenewal ? null : studentId,
            },
          });
        });

        // Outside the transaction: attach the new guardian + student to a
        // Family. Done after commit so the family-helper's own transaction
        // can run without deadlocking against the outer one.
        if (newGuardianForFamily && newStudentForFamily) {
          try {
            await linkStudentToGuardianFamily(
              newStudentForFamily,
              newGuardianForFamily,
            );
          } catch (e) {
            // Non-fatal — admin can re-assign via the family backfill later.
            console.error("[admissions:accept] family linking failed:", e);
          }
        }
      } catch (e) {
        console.error("[admissions:accept] transaction failed:", e);
        return { error: "transaction-failed" };
      }
    } else {
      await db.application.update({
        where: { id: applicationId },
        data: {
          status: parsed.data.decision,
          decisionNote: parsed.data.decisionNote ?? null,
          decisionAt: isFinal ? now : null,
          reviewedAt: now,
          reviewedByUserId: user.id,
        },
      });
    }

    revalidatePath("/admissions-admin");
    revalidatePath(`/admissions-admin/${applicationId}`);
    revalidatePath("/parent/applications");
    revalidatePath(`/parent/applications/${applicationId}`);

    // Fire-and-forget parent email for final decisions.
    if (parsed.data.decision === "ACCEPTED" || parsed.data.decision === "WAITLISTED" || parsed.data.decision === "DECLINED") {
      notifyParentOfDecision(tenantId, applicationId, parsed.data.decision, parsed.data.decisionNote ?? null).catch(
        (e) => console.error("[email] applicationDecided notify failed:", e),
      );
    }
    return {};
  });
}

async function notifyParentOfDecision(
  tenantId: string,
  applicationId: string,
  decision: "ACCEPTED" | "WAITLISTED" | "DECLINED",
  decisionNote: string | null,
) {
  const u = unscopedDb();
  const [tenant, app] = await Promise.all([
    u.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    u.application.findUnique({
      where: { id: applicationId },
      select: {
        childFirstName: true,
        childLastName: true,
        submittedBy: { select: { email: true, name: true } },
      },
    }),
  ]);
  if (!tenant || !app) return;
  await sendApplicationDecidedEmail({
    to: { email: app.submittedBy.email, name: app.submittedBy.name },
    tenantName: tenant.name,
    decision,
    childFirstName: app.childFirstName,
    childLastName: app.childLastName,
    decisionNote,
    applicationId,
  });
}

// ── Archive / soft-delete / restore (admin row actions) ─────

/**
 * Move an application to the Archived section (or back to Active). Archived
 * rows still exist in the DB so reports + audit history work — they're just
 * hidden from the default list view.
 */
export async function setApplicationArchived(
  applicationId: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    await db.application.update({
      where: { id: applicationId },
      data: {
        archived,
        archivedAt: archived ? new Date() : null,
        // Coming back from the deleted bucket: clear the tombstone too.
        deletedAt: null,
      },
    });
    revalidatePath("/admissions-admin");
    revalidatePath(`/admissions-admin/${applicationId}`);
    return { ok: true };
  });
}

/**
 * Soft delete — stamps `deletedAt` and moves the row into the Deleted
 * section. Recoverable until an admin permanently purges it from there.
 * Refuses if the application already produced a Student row, since the
 * kid would lose their admission audit trail.
 */
export async function softDeleteApplication(
  applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, resultingStudentId: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.resultingStudentId) {
      return { ok: false, error: "produced-student" };
    }
    await db.application.update({
      where: { id: applicationId },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/admissions-admin");
    revalidatePath(`/admissions-admin/${applicationId}`);
    return { ok: true };
  });
}

/**
 * Restore a deleted (or archived) row back to Active. Clears both
 * `deletedAt` and `archived` so the row reappears in the default view.
 */
export async function restoreApplication(
  applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    await db.application.update({
      where: { id: applicationId },
      data: { deletedAt: null, archived: false, archivedAt: null },
    });
    revalidatePath("/admissions-admin");
    revalidatePath(`/admissions-admin/${applicationId}`);
    return { ok: true };
  });
}

/**
 * Hard delete — permanently removes the application row and everything
 * that FK-cascades (ApplicationAnswer, ApplicationDocument). Only
 * accessible from the Deleted section; storage objects for documents
 * are not cleaned up here.
 *
 * Same produced-student guard as soft delete — admin must detach the
 * student first.
 */
export async function permanentlyDeleteApplication(
  applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, resultingStudentId: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.resultingStudentId) {
      return { ok: false, error: "produced-student" };
    }
    await db.application.delete({ where: { id: applicationId } });
    revalidatePath("/admissions-admin");
    return { ok: true };
  });
}

// ── Bulk variants ──────────────────────────────────────────
// Each returns `{ ok, processed, skipped }` so the toast can tell the
// admin "12 archived, 1 skipped (already produced a student)".

type BulkResult = { ok: boolean; processed: number; skipped: number };

async function withParents<T>(ids: string[], fn: (tenantId: string) => Promise<T>): Promise<T | { ok: false; processed: 0; skipped: 0 }> {
  if (ids.length === 0) {
    return { ok: false, processed: 0, skipped: 0 } as unknown as T;
  }
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) {
    return { ok: false, processed: 0, skipped: 0 } as unknown as T;
  }
  return runWithTenant({ tenantId, slug: null }, () => fn(tenantId));
}

/** Bulk move to/from the Archived section. Skips no rows. */
export async function bulkSetApplicationsArchived(
  ids: string[],
  archived: boolean,
): Promise<BulkResult> {
  return withParents(ids, async () => {
    const r = await db.application.updateMany({
      where: { id: { in: ids } },
      data: {
        archived,
        archivedAt: archived ? new Date() : null,
        deletedAt: null,
      },
    });
    revalidatePath("/admissions-admin");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<BulkResult>;
}

/** Bulk soft delete. Skips rows that already produced a Student. */
export async function bulkSoftDeleteApplications(
  ids: string[],
): Promise<BulkResult> {
  return withParents(ids, async () => {
    const r = await db.application.updateMany({
      where: { id: { in: ids }, resultingStudentId: null },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/admissions-admin");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<BulkResult>;
}

/** Bulk restore back to Active. */
export async function bulkRestoreApplications(
  ids: string[],
): Promise<BulkResult> {
  return withParents(ids, async () => {
    const r = await db.application.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: null, archived: false, archivedAt: null },
    });
    revalidatePath("/admissions-admin");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<BulkResult>;
}

/**
 * Bulk permanent delete. Same produced-student guard as the single
 * version — those rows are skipped instead of failing the whole batch.
 */
export async function bulkPermanentlyDeleteApplications(
  ids: string[],
): Promise<BulkResult> {
  return withParents(ids, async () => {
    const r = await db.application.deleteMany({
      where: { id: { in: ids }, resultingStudentId: null },
    });
    revalidatePath("/admissions-admin");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<BulkResult>;
}
