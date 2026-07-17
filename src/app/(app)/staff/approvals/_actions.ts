"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { notifyUser } from "@/lib/staff-notify";

/**
 * Supervisor stage decision. Only the request's snapshotted supervisor (matched
 * by their linked user) may act, and only while PENDING_SUPERVISOR. Approve →
 * PENDING_FINANCE; reject → REJECTED. The requester is notified either way.
 */
export async function supervisorDecision(
  id: string,
  decision: "approve" | "reject",
  formData?: FormData,
): Promise<void> {
  await withStaffSession(async (user, approver) => {
    if (!approver) return;
    const req = await db.attendanceRequest.findFirst({
      where: { id, status: "PENDING_SUPERVISOR", supervisor: { userId: user.id } },
      select: {
        id: true,
        employee: { select: { user: { select: { id: true, locale: true } } } },
      },
    });
    if (!req) return;
    const note = String(formData?.get("note") ?? "").trim() || null;

    // Atomic claim: assert the status in the WHERE so a concurrent decision or a
    // requester cancel that already moved the row makes this a no-op (count 0).
    const { count } = await db.attendanceRequest.updateMany({
      where: { id: req.id, status: "PENDING_SUPERVISOR" },
      data: {
        status: decision === "approve" ? "PENDING_FINANCE" : "REJECTED",
        supervisorDecisionByUserId: user.id,
        supervisorDecisionAt: new Date(),
        decisionNote: note,
      },
    });
    if (count === 0) return; // lost the race — already decided/cancelled

    if (decision === "approve") {
      await notifyUser(req.employee.user, "forwarded", { name: approver.displayName }, "/staff/requests");
    } else {
      await notifyUser(req.employee.user, "rejected", { reason: note ?? "—" }, "/staff/requests");
    }

    revalidatePath("/staff/approvals");
    revalidatePath("/staff/requests");
    revalidatePath("/staff");
    revalidatePath("/payroll/requests");
  });
}
