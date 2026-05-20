"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const SEVERITIES = ["NOTE", "WARNING", "DETENTION", "SUSPENSION"] as const;

const eventSchema = z.object({
  studentId: z.string().min(1),
  type: z.string().trim().min(1).max(80),
  severity: z.enum(SEVERITIES),
  description: z.string().trim().min(1).max(2000),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : new Date())),
});

export type DisciplineFormState = {
  errors?: Partial<Record<keyof z.input<typeof eventSchema>, string>>;
  formError?: string;
};

export async function createDisciplineEvent(
  _prev: DisciplineFormState,
  formData: FormData,
): Promise<DisciplineFormState> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };

  const parsed = eventSchema.safeParse({
    studentId: String(formData.get("studentId") ?? ""),
    type: String(formData.get("type") ?? ""),
    severity: String(formData.get("severity") ?? ""),
    description: String(formData.get("description") ?? ""),
    date: String(formData.get("date") ?? ""),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: DisciplineFormState["errors"] = {};
    for (const [k, v] of Object.entries(flat)) {
      if (v && v.length > 0) (errors as Record<string, string>)[k] = v[0]!;
    }
    return { errors };
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.disciplineEvent.create({
      data: {
        tenantId,
        studentId: parsed.data.studentId,
        type: parsed.data.type,
        severity: parsed.data.severity,
        description: parsed.data.description,
        date: parsed.data.date,
        reportedById: user.id,
      },
    });
  });

  revalidatePath("/discipline");
  revalidatePath(`/students/${parsed.data.studentId}`);
  redirect("/discipline");
}
