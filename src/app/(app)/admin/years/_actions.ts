"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const yearSchema = z.object({
  label: z.string().trim().min(1).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.string().optional().transform((v) => v === "on" || v === "true"),
});

export type YearFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

export async function createYear(
  _prev: YearFormState,
  formData: FormData,
): Promise<YearFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = yearSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    isActive: String(formData.get("isActive") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  let didCreate = false;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const existing = await db.academicYear.findUnique({
      where: { tenantId_label: { tenantId, label: parsed.data.label } },
      select: { id: true },
    });
    if (existing) return;
    // If marking this one as active, demote the previous active year.
    if (parsed.data.isActive) {
      await db.academicYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }
    await db.academicYear.create({
      data: {
        tenantId,
        label: parsed.data.label,
        startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
        endDate: new Date(`${parsed.data.endDate}T23:59:59.000Z`),
        isActive: parsed.data.isActive,
      },
    });
    didCreate = true;
  });

  if (!didCreate) return { errors: { label: "yearAlreadyExists" } };
  revalidatePath("/admin/years");
  redirect("/admin/years");
}

export async function setActiveYear(yearId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.academicYear.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    await db.academicYear.update({
      where: { id: yearId },
      data: { isActive: true },
    });
  });
  revalidatePath("/admin/years");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
}

/**
 * Hard delete an academic year. Cascades to Classes via the schema's
 * `onDelete: Cascade` and to Enrollments (which FK to both Class and
 * Year). Refuses if the year still has enrollments — those represent
 * real kids, deleting them silently would be data loss.
 */
export async function deleteYear(
  yearId: string,
): Promise<{ ok: boolean; error?: string; enrollmentCount?: number }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const year = await db.academicYear.findUnique({
      where: { id: yearId },
      select: {
        id: true,
        _count: { select: { enrollments: true, classes: true } },
      },
    });
    if (!year) return { ok: false, error: "not-found" };

    // Refuse when real enrollments still hang off the year — would
    // wipe student-classroom assignments silently.
    if (year._count.enrollments > 0) {
      return {
        ok: false,
        error: "has-enrollments",
        enrollmentCount: year._count.enrollments,
      };
    }

    await db.academicYear.delete({ where: { id: yearId } });
    revalidatePath("/admin/years");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    return { ok: true };
  });
}
