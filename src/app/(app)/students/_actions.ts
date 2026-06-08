"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "@/lib/entity-fields";

const STATUSES = ["PROSPECT", "ENROLLED", "WITHDRAWN", "GRADUATED"] as const;
const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const studentSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dob: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v !== "" ? new Date(v) : null))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), { message: "Invalid date" }),
  status: z.enum(STATUSES),
  gender: z
    .string()
    .optional()
    .transform((v) => (v && (GENDERS as readonly string[]).includes(v) ? v : null))
    .pipe(z.enum(GENDERS).nullable()),
  nationality: optionalTrimmed(80),
  placeOfBirth: optionalTrimmed(120),
  address: optionalTrimmed(200),
  city: optionalTrimmed(80),
  postalCode: optionalTrimmed(20),
  country: optionalTrimmed(80),
  previousSchool: optionalTrimmed(160),
  emergencyContact: optionalTrimmed(200),
  internalNotes: optionalTrimmed(4000),
});

type StudentInput = z.input<typeof studentSchema>;

export type StudentFormState = {
  errors?: Partial<Record<keyof StudentInput, string>>;
  formError?: string;
};

const FIELDS = [
  "firstName",
  "lastName",
  "dob",
  "status",
  "gender",
  "nationality",
  "placeOfBirth",
  "address",
  "city",
  "postalCode",
  "country",
  "previousSchool",
  "emergencyContact",
  "internalNotes",
] as const;

function parseForm(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const f of FIELDS) {
    raw[f] = String(formData.get(f) ?? "");
  }
  return studentSchema.safeParse(raw);
}

function zodToState(error: z.ZodError): StudentFormState {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  const errors: StudentFormState["errors"] = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v && v.length > 0) {
      (errors as Record<string, string>)[k] = v[0]!;
    }
  }
  return { errors };
}

export async function createStudent(
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };
  const parsed = parseForm(formData);
  if (!parsed.success) return zodToState(parsed.error);

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const created = await db.student.create({
      data: { tenantId, ...parsed.data },
      select: { id: true },
    });
    newId = created.id;
  });

  revalidatePath("/students");
  redirect(`/students/${newId}`);
}

export async function updateStudent(
  id: string,
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };
  const parsed = parseForm(formData);
  if (!parsed.success) return zodToState(parsed.error);

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.update({
      where: { id },
      data: parsed.data,
    });
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.delete({ where: { id } });
  });
  revalidatePath("/students");
  redirect("/students");
}

/**
 * Inline save of the built-in identity columns from the student fiche (the
 * "Identité" section's pencil) — same read-only + pencil UX as the custom
 * categories, instead of an always-open form. Returns {ok} for the client.
 */
export async function saveStudentIdentity(
  studentId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const parsed = studentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  return runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.update({ where: { id: studentId }, data: parsed.data });
    revalidatePath(`/students/${studentId}`);
    return { ok: true };
  });
}

/**
 * Inline per-category save from the student fiche (EditableGroup). Merges the
 * submitted values into Student.customAnswers by key, like the parent fiche's
 * saveStudentFiche, but revalidates the student detail page.
 */
export async function saveStudentFicheFields(
  studentId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { customAnswers: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    const answers: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};
    for (const [k, v] of Object.entries(values)) answers[k] = (v ?? "").trim();
    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/admin/parents", "layout");
    return { ok: true };
  });
}

/**
 * Inline per-YEAR save from the student fiche's year-aware view
 * (StudentYearView). Authorizations and the transport mode are stored per
 * academic year inside customAnswers.registration_by_year[<year>], so editing
 * them merges into THAT year's object — never the single value (which gets
 * polluted by the latest in-progress re-registration draft). An empty value
 * clears the key for that year.
 */
export async function saveStudentRegistrationYear(
  studentId: string,
  year: string,
  fields: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { customAnswers: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    const answers: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};

    let byYear: Record<string, Record<string, string>> = {};
    if (typeof answers.registration_by_year === "string") {
      try {
        byYear = JSON.parse(answers.registration_by_year) as Record<
          string,
          Record<string, string>
        >;
      } catch {
        byYear = {};
      }
    }
    const current: Record<string, string> = { ...(byYear[year] ?? {}) };
    for (const [k, v] of Object.entries(fields)) {
      const t = (v ?? "").trim();
      if (t === "") delete current[k];
      else current[k] = t;
    }
    byYear[year] = current;
    answers.registration_by_year = JSON.stringify(byYear);

    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
    revalidatePath(`/students/${studentId}`);
    return { ok: true };
  });
}

// ─── Custom answers (Round 6) ──────────────────────────────────

/** See updateParentCustomAnswers for the storage contract — same shape. */
export async function updateStudentCustomAnswers(
  studentId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { studentFieldsConfig: true },
  });
  const config: EntityFieldsConfig = parseEntityFieldsConfig(
    tenant?.studentFieldsConfig,
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

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
  });
  revalidatePath(`/students/${studentId}`);
  return { ok: true };
}
