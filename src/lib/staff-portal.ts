import { unscopedDb } from "./db";
import type { SessionUser } from "./session";
import type { BellItem } from "@/components/shell/notification-bell";

export type StaffShellData = {
  notifications: BellItem[];
  unreadCount: number;
  supervisorPending: number; // requests awaiting me as supervisor
  isSupervisor: boolean; // do I supervise anyone?
  financePending: number; // admin: requests awaiting finance
};

/**
 * Sidebar data for staff-side roles: portal notifications + pending-approval
 * counts for nav badges. Runs in the (app) layout, which is NOT inside a tenant
 * context, so it queries the unscoped client with an explicit tenantId filter
 * (always the caller's own tenant + own user — no cross-tenant exposure).
 */
export async function getStaffShellData(user: SessionUser): Promise<StaffShellData | null> {
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  if (user.role !== "STAFF" && user.role !== "TEACHER" && user.role !== "SCHOOL_ADMIN") {
    return null;
  }
  const db = unscopedDb();
  const [rawNotifs, unreadCount, supervisorPending, reportsCount, financePending] = await Promise.all([
    db.staffNotification.findMany({
      where: { tenantId, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.staffNotification.count({ where: { tenantId, userId: user.id, readAt: null } }),
    db.attendanceRequest.count({
      where: { tenantId, status: "PENDING_SUPERVISOR", supervisor: { userId: user.id } },
    }),
    db.payrollEmployee.count({ where: { tenantId, supervisor: { userId: user.id } } }),
    user.role === "SCHOOL_ADMIN"
      ? db.attendanceRequest.count({ where: { tenantId, status: "PENDING_FINANCE" } })
      : Promise.resolve(0),
  ]);

  return {
    notifications: rawNotifs.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
    supervisorPending,
    // Show the approvals surface if they currently supervise anyone OR still
    // hold an in-flight request pending their decision (e.g. after being
    // unassigned from their last report) — the request snapshot outlives the
    // live report link.
    isSupervisor: reportsCount > 0 || supervisorPending > 0,
    financePending,
  };
}
