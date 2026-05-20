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

// ── Admission cycle CRUD ────────────────────────────────────

const cycleSchema = z.object({
  label: z.string().trim().min(1).max(120),
  targetYearLabel: z.string().trim().min(1).max(40),
  openAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closeAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
