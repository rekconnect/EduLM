"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

/** Mark all of the current user's unread notifications as read. */
export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  if (!user.tenantId) return;
  await runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    await db.staffNotification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  });
  revalidatePath("/", "layout");
}

/** Mark a single notification read (fired when the user opens its link). */
export async function markNotificationRead(id: string): Promise<void> {
  const user = await requireUser();
  if (!user.tenantId) return;
  await runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    await db.staffNotification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  });
  revalidatePath("/", "layout");
}
