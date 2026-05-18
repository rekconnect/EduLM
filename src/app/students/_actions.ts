"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

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
