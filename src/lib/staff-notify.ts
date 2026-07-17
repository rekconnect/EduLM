import { getTranslations } from "next-intl/server";
import { db } from "./db";
import { requireTenantId } from "./tenant-context";

type Recipient = { id: string | null | undefined; locale?: string | null };

/**
 * Create a staff-portal notification for `recipient`, rendered in THAT user's
 * own locale (title + body come from the `notif` message namespace, keyed by
 * `msgKey`). No-op when the recipient has no linked account. Must run inside
 * runWithTenant — the tenant-scoped client fills tenantId.
 */
export async function notifyUser(
  recipient: Recipient | null,
  msgKey: string,
  values: Record<string, string>,
  href?: string,
) {
  if (!recipient?.id) return;
  const t = await getTranslations({ locale: recipient.locale || "fr", namespace: "notif" });
  await db.staffNotification.create({
    data: {
      tenantId: requireTenantId(),
      userId: recipient.id,
      kind: msgKey,
      title: t(`${msgKey}.title`, values),
      body: t(`${msgKey}.body`, values),
      href: href ?? null,
    },
  });
}
