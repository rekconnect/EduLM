"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { decimalStringToCents } from "@/lib/money";
import { sendApplicationDecidedEmail } from "@/lib/emails/notifications";

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
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  const feeCents = parsed.data.inscriptionFee ? decimalStringToCents(parsed.data.inscriptionFee) : 0;
  await runWithTenant({ tenantId, slug: null }, async () => {
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
      },
    });
  });
  revalidatePath("/admissions-admin/cycles");
  redirect("/admissions-admin/cycles");
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
