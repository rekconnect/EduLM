"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const classSchema = z.object({
  academicYearId: z.string().min(1).optional(),
  level: z.string().trim().min(1).max(40),
  section: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
});

export type ClassFormState = {
  errors?: Partial<Record<"academicYearId" | "level" | "section" | "name", string>>;
  formError?: string;
};

export async function createClass(
  _prev: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };

  const parsed = classSchema.safeParse({
    academicYearId: String(formData.get("academicYearId") ?? "") || undefined,
    level: String(formData.get("level") ?? ""),
    section: String(formData.get("section") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: ClassFormState["errors"] = {};
    for (const [k, v] of Object.entries(flat)) {
      if (v && v.length > 0) (errors as Record<string, string>)[k] = v[0]!;
    }
    return { errors };
  }

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Use explicit year if provided, otherwise fall back to active.
    const yearId = parsed.data.academicYearId
      ? (await db.academicYear.findUnique({
          where: { id: parsed.data.academicYearId },
          select: { id: true },
        }))?.id
      : (await db.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        }))?.id;
    if (!yearId) return;
    const created = await db.class.create({
      data: {
        tenantId,
        academicYearId: yearId,
        level: parsed.data.level,
        section: parsed.data.section,
        name: parsed.data.name,
      },
      select: { id: true },
    });
    newId = created.id;
  });

  if (!newId) return { formError: "No academic year" };

  revalidatePath("/classes");
  redirect(`/classes/${newId}`);
}

export async function enrollStudent(classId: string, formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return;

  await runWithTenant({ tenantId, slug: null }, async () => {
    const klass = await db.class.findUnique({
      where: { id: classId },
      select: { academicYearId: true },
    });
    if (!klass) return;
    await db.enrollment.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: klass.academicYearId } },
      update: { classId },
      create: {
        tenantId,
        studentId,
        classId,
        academicYearId: klass.academicYearId,
      },
    });
  });

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/students");
}

export async function unenrollStudent(classId: string, studentId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;

  await runWithTenant({ tenantId, slug: null }, async () => {
    const klass = await db.class.findUnique({
      where: { id: classId },
      select: { academicYearId: true },
    });
    if (!klass) return;
    await db.enrollment.deleteMany({
      where: { studentId, academicYearId: klass.academicYearId, classId },
    });
  });

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/students");
}
