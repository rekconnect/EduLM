"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { notifyUser } from "@/lib/staff-notify";

/**
 * Finance stage decision by an admin. Only PENDING_FINANCE requests; approve →
 * APPROVED, reject → REJECTED. Requester notified.
 */
export async function financeDecision(
  id: string,
  decision: "approve" | "reject",
  formData?: FormData,
): Promise<void> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const req = await db.attendanceRequest.findFirst({
      where: { id, status: "PENDING_FINANCE" },
      select: { id: true, employee: { select: { user: { select: { id: true, locale: true } } } } },
    });
    if (!req) return;
    const note = String(formData?.get("note") ?? "").trim() || null;
    const { count } = await db.attendanceRequest.updateMany({
      where: { id: req.id, status: "PENDING_FINANCE" },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        financeDecisionByUserId: user.id,
        financeDecisionAt: new Date(),
        decisionNote: note,
      },
    });
    if (count === 0) return; // already decided by another admin
    await notifyUser(
      req.employee.user,
      decision === "approve" ? "approved" : "rejected",
      decision === "approve" ? {} : { reason: note ?? "—" },
      "/staff/requests",
    );
    revalidatePath("/payroll/requests");
    revalidatePath("/staff/requests");
    revalidatePath("/staff");
  });
}

/**
 * Admin override: undo a FINANCE decision back to PENDING_FINANCE for
 * re-decision. Only rows that actually reached the finance stage
 * (financeDecisionByUserId set) are eligible — undoing a supervisor rejection
 * would let finance approve a request the supervisor blocked, skipping the
 * supervisor stage. Requester notified.
 */
export async function undoDecision(id: string): Promise<void> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const req = await db.attendanceRequest.findFirst({
      where: {
        id,
        status: { in: ["APPROVED", "REJECTED"] },
        financeDecisionByUserId: { not: null },
      },
      select: { id: true, employee: { select: { user: { select: { id: true, locale: true } } } } },
    });
    if (!req) return;
    const { count } = await db.attendanceRequest.updateMany({
      where: {
        id: req.id,
        status: { in: ["APPROVED", "REJECTED"] },
        financeDecisionByUserId: { not: null },
      },
      data: {
        status: "PENDING_FINANCE",
        financeDecisionByUserId: null,
        financeDecisionAt: null,
        decisionNote: null,
      },
    });
    if (count === 0) return;
    await notifyUser(req.employee.user, "reopened", {}, "/staff/requests");
    revalidatePath("/payroll/requests");
    revalidatePath("/staff/requests");
    revalidatePath("/staff");
  });
}

/**
 * Rescue for a request stranded at PENDING_SUPERVISOR because its snapshotted
 * supervisor was deleted (supervisorId null) or lost its portal account
 * (supervisor.userId null) — nobody could otherwise act on it. Admin forwards
 * it into the finance queue, where the normal decision flow takes over.
 */
export async function forwardStrandedRequest(id: string): Promise<void> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const req = await db.attendanceRequest.findFirst({
      where: {
        id,
        status: "PENDING_SUPERVISOR",
        OR: [{ supervisorId: null }, { supervisor: { userId: null } }],
      },
      select: { id: true, employee: { select: { user: { select: { id: true, locale: true } } } } },
    });
    if (!req) return;
    const { count } = await db.attendanceRequest.updateMany({
      where: { id: req.id, status: "PENDING_SUPERVISOR" },
      data: { status: "PENDING_FINANCE" },
    });
    if (count === 0) return;
    await notifyUser(req.employee.user, "forwarded", { name: "—" }, "/staff/requests");
    revalidatePath("/payroll/requests");
    revalidatePath("/staff/requests");
    revalidatePath("/staff");
  });
}
