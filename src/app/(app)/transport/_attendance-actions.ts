"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const BUS_ATT_STATUSES = [
  "present",
  "absent",
  "retard",
  "depart_autorise",
  "activite",
] as const;

/**
 * Set (or clear) a student's attendance for one bus on one day — clicked
 * from the Autocars tab. status "" deletes the mark. No revalidation: the
 * client keeps the optimistic state; the next page load re-reads the table.
 */
export async function setBusAttendance(input: {
  studentId: string;
  bus: string;
  date: string; // "YYYY-MM-DD"
  status: string; // one of BUS_ATT_STATUSES or "" to clear
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const bus = (input.bus ?? "").trim().slice(0, 20);
  const date = (input.date ?? "").trim();
  const status = (input.status ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "bad-date" };
  if (!bus) return { ok: false, error: "bad-bus" };
  if (status && !(BUS_ATT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "bad-status" };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: input.studentId },
      select: { id: true },
    });
    if (!st) return { ok: false, error: "not-found" };

    if (!status) {
      await db.busAttendance.deleteMany({
        where: { tenantId, studentId: input.studentId, date, bus },
      });
      return { ok: true };
    }
    await db.busAttendance.upsert({
      where: {
        tenantId_studentId_date_bus: { tenantId, studentId: input.studentId, date, bus },
      },
      update: { status },
      create: { tenantId, studentId: input.studentId, date, bus, status },
    });
    return { ok: true };
  });
}
