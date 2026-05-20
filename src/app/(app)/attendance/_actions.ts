"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

const recordSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(STATUSES),
  lateMinutes: z
    .string()
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
      message: "Invalid minutes",
    }),
  note: z.string().max(500).optional().transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

const batchSchema = z.object({
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(recordSchema).min(1),
});

export type AttendanceSaveResult = {
  ok: boolean;
  count?: number;
  error?: string;
};

/**
 * Batch upsert attendance records for one class on one day.
 * Form encoding: each row submitted as record[i][studentId|status|lateMinutes|note].
 */
export async function saveAttendance(formData: FormData): Promise<AttendanceSaveResult> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "No tenant" };

  const classId = String(formData.get("classId") ?? "");
  const date = String(formData.get("date") ?? "");

  const rows: { studentId: string; status: string; lateMinutes: string; note: string }[] = [];
  for (const key of formData.keys()) {
    const m = key.match(/^record\[(\d+)\]\[studentId\]$/);
    if (!m) continue;
    const i = m[1];
    rows.push({
      studentId: String(formData.get(`record[${i}][studentId]`) ?? ""),
      status: String(formData.get(`record[${i}][status]`) ?? ""),
      lateMinutes: String(formData.get(`record[${i}][lateMinutes]`) ?? ""),
      note: String(formData.get(`record[${i}][note]`) ?? ""),
    });
  }

  const parsed = batchSchema.safeParse({ classId, date, records: rows });
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const day = new Date(`${parsed.data.date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) return { ok: false, error: "Invalid date" };

  let count = 0;
  await runWithTenant({ tenantId, slug: null }, async () => {
    for (const r of parsed.data.records) {
      await db.attendanceRecord.upsert({
        where: { studentId_date: { studentId: r.studentId, date: day } },
        update: {
          status: r.status,
          lateMinutes: r.lateMinutes,
          note: r.note,
        },
        create: {
          tenantId,
          studentId: r.studentId,
          date: day,
          status: r.status,
          lateMinutes: r.lateMinutes,
          note: r.note,
        },
      });
      count++;
    }
  });

  revalidatePath("/attendance");
  revalidatePath(`/students`);
  return { ok: true, count };
}
