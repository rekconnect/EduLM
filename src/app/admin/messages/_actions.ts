"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { sendContactMessageEmail } from "@/lib/emails/notifications";

const sendSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
});

export type ContactFormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

export async function sendContactMessage(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = sendSchema.safeParse({
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  let newMessageId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const created = await db.contactMessage.create({
      data: {
        tenantId,
        fromUserId: user.id,
        subject: parsed.data.subject,
        body: parsed.data.body,
        status: "NEW",
      },
      select: { id: true },
    });
    newMessageId = created.id;
  });

  if (newMessageId) {
    notifyAdminsOfContactMessage(
      tenantId,
      newMessageId,
      user.name ?? user.email,
      user.email,
      parsed.data.subject,
      parsed.data.body,
    ).catch((e) => console.error("[email] contactMessage notify failed:", e));
  }

  revalidatePath("/admin/messages");
  return { ok: true };
}

async function notifyAdminsOfContactMessage(
  tenantId: string,
  messageId: string,
  fromName: string,
  fromEmail: string,
  subject: string,
  body: string,
) {
  const u = unscopedDb();
  try {
    const [tenant, admins] = await Promise.all([
      u.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      u.user.findMany({
        where: { tenantId, role: "SCHOOL_ADMIN", status: "ACTIVE" },
        select: { email: true, name: true },
      }),
    ]);
    if (!tenant || admins.length === 0) return;
    await sendContactMessageEmail({
      to: admins,
      tenantName: tenant.name,
      fromName,
      fromEmail,
      subject,
      body,
      messageId,
    });
  } finally {
    await u.$disconnect();
  }
}

export async function markMessageRead(messageId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.contactMessage.update({
      where: { id: messageId },
      data: { status: "READ", readAt: new Date(), readByUserId: user.id },
    });
  });
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${messageId}`);
}

export async function closeMessage(messageId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.contactMessage.update({
      where: { id: messageId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
  });
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${messageId}`);
  redirect("/admin/messages");
}

export async function reopenMessage(messageId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.contactMessage.update({
      where: { id: messageId },
      data: { status: "READ", closedAt: null },
    });
  });
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${messageId}`);
}
