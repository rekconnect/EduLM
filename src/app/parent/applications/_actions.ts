"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { sendApplicationSubmittedEmail } from "@/lib/emails/notifications";

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

const identitySchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  childLastName: z.string().trim().min(1).max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
  childGender: z.enum(GENDERS).optional().nullable(),
  childNationality: z.string().trim().max(80).optional().nullable(),
  childPlaceOfBirth: z.string().trim().max(120).optional().nullable(),
});

const familySchema = z.object({
  primaryParentName: z.string().trim().min(1).max(120),
  primaryParentPhone: z.string().trim().max(40).optional().nullable(),
  primaryParentEmail: z.string().trim().max(200).optional().nullable(),
  secondaryParentName: z.string().trim().max(120).optional().nullable(),
  secondaryParentPhone: z.string().trim().max(40).optional().nullable(),
  secondaryParentEmail: z.string().trim().max(200).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
});

const academicSchema = z.object({
  currentSchool: z.string().trim().max(160).optional().nullable(),
  currentLevel: z.string().trim().max(80).optional().nullable(),
  requestedLevel: z.string().trim().min(1).max(80),
  motivationNote: z.string().trim().max(2000).optional().nullable(),
});

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
      select: { id: true, submittedByUserId: true, status: true },
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

  const raw = normalize(formData, [
    "childFirstName",
    "childLastName",
    "childDob",
    "childGender",
    "childNationality",
    "childPlaceOfBirth",
  ]);
  const parsed = identitySchema.safeParse(raw);
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

  const raw = normalize(formData, [
    "primaryParentName",
    "primaryParentPhone",
    "primaryParentEmail",
    "secondaryParentName",
    "secondaryParentPhone",
    "secondaryParentEmail",
    "address",
    "city",
    "postalCode",
    "country",
  ]);
  const parsed = familySchema.safeParse(raw);
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

  const raw = normalize(formData, [
    "currentSchool",
    "currentLevel",
    "requestedLevel",
    "motivationNote",
  ]);
  const parsed = academicSchema.safeParse(raw);
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
  redirect(`/parent/applications/${id}/edit?step=4`);
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
      },
    });
    if (!app || app.submittedByUserId !== user.id) return;
    if (app.status !== "DRAFT") return;
    if (!app.childFirstName || !app.childLastName || !app.requestedLevel) return;
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
        enrollments: {
          orderBy: { enrolledAt: "desc" },
          take: 1,
          select: { class: { select: { level: true, name: true } } },
        },
        guardianLinks: {
          include: {
            guardian: {
              include: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });
    if (!student) return;

    const primaryGuardian = student.guardianLinks[0]?.guardian.user;

    // Pre-fill family contact info from the most-recent prior application —
    // the parent has given us this already; don't make them retype it.
    const prior = await getPriorFamilyInfo(user.id);

    const created = await db.application.create({
      data: {
        tenantId,
        cycleId,
        submittedByUserId: user.id,
        existingStudentId: studentId,
        status: "DRAFT",
        childFirstName: student.firstName,
        childLastName: student.lastName,
        childDob: student.dob,
        primaryParentName:
          prior?.primaryParentName ||
          primaryGuardian?.name ||
          user.name ||
          "",
        primaryParentEmail:
          prior?.primaryParentEmail || primaryGuardian?.email || user.email,
        primaryParentPhone: prior?.primaryParentPhone ?? null,
        secondaryParentName: prior?.secondaryParentName ?? null,
        secondaryParentPhone: prior?.secondaryParentPhone ?? null,
        secondaryParentEmail: prior?.secondaryParentEmail ?? null,
        address: prior?.address ?? null,
        city: prior?.city ?? null,
        postalCode: prior?.postalCode ?? null,
        country: prior?.country ?? null,
        currentLevel: student.enrollments[0]?.class.level ?? null,
      },
      select: { id: true },
    });
    appId = created.id;
  });

  if (!appId) redirect("/parent/dashboard");
  revalidatePath("/parent/applications");
  redirect(`/parent/applications/${appId}/edit`);
}
