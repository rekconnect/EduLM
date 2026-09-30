"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { notifySchoolOfParentPost, parentDisplayName } from "@/lib/messaging";
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX } from "@/lib/messaging-shared";

/**
 * Parent side of the messagerie. Every action is PARENT-only and every
 * thread lookup is pinned to `parentUserId: user.id` — a parent can never
 * read, reply to or even detect another family's conversation.
 */

export type ParentActionResult =
  | { ok: true; threadId?: string }
  | { ok: false; error: string };

function isId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
}

const newThreadSchema = z.object({
  subject: z.string().trim().min(1).max(MESSAGE_SUBJECT_MAX),
  body: z.string().trim().min(1).max(MESSAGE_BODY_MAX),
});

/** "Écrire à l'école" — opens a new conversation with the school. */
export async function startThreadAsParent(input: {
  subject: string;
  body: string;
}): Promise<ParentActionResult> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const parsed = newThreadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const me = await db.user.findFirst({
      where: { id: user.id },
      select: { name: true, firstName: true, lastName: true, email: true },
    });
    const now = new Date();
    const thread = await db.$transaction(async (tx) => {
    const created = await tx.messageThread.create({
      data: {
        tenantId,
        parentUserId: user.id,
        subject: parsed.data.subject,
        origin: "PARENT",
        allowReplies: true,
        parentUnread: false,
        parentReadAt: now,
        schoolUnread: true,
        lastMessageAt: now,
      },
      select: { id: true },
    });
    await tx.messagePost.create({
      data: {
        tenantId,
        threadId: created.id,
        authorUserId: user.id,
        fromSchool: false,
        body: parsed.data.body,
      },
    });
    return created;
    });
    notifySchoolOfParentPost({
      tenantId,
      threadId: thread.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      fromName: me ? parentDisplayName(me) : user.email,
      fromEmail: user.email,
    });
    revalidatePath("/parent/messages");
    return { ok: true, threadId: thread.id } as const;
  });
}

/** Reply in one of MY conversations (only when replies are allowed + open). */
export async function replyAsParent(
  threadId: string,
  body: string,
): Promise<ParentActionResult> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  if (!isId(threadId) || typeof body !== "string") return { ok: false, error: "invalid" };
  const text = body.trim();
  if (!text || text.length > MESSAGE_BODY_MAX) return { ok: false, error: "invalid" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const thread = await db.messageThread.findFirst({
      where: { id: threadId, parentUserId: user.id },
      select: {
        id: true,
        subject: true,
        allowReplies: true,
        status: true,
        broadcast: { select: { senderUserId: true } },
      },
    });
    if (!thread) return { ok: false, error: "not-found" } as const;
    if (!thread.allowReplies) return { ok: false, error: "replies-disabled" } as const;
    if (thread.status !== "OPEN") return { ok: false, error: "closed" } as const;

    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.messagePost.create({
        data: {
          tenantId,
          threadId,
          authorUserId: user.id,
          fromSchool: false,
          body: text,
        },
      });
      await tx.messageThread.update({
        where: { id: threadId, tenantId },
        data: { lastMessageAt: now, schoolUnread: true, parentUnread: false },
      });
    });
    const me = await db.user.findFirst({
      where: { id: user.id },
      select: { name: true, firstName: true, lastName: true, email: true },
    });
    notifySchoolOfParentPost({
      tenantId,
      threadId,
      subject: thread.subject,
      body: text,
      fromName: me ? parentDisplayName(me) : user.email,
      fromEmail: user.email,
      broadcastSenderId: thread.broadcast?.senderUserId ?? null,
    });
    revalidatePath(`/parent/messages/${threadId}`);
    revalidatePath("/parent/messages");
    return { ok: true } as const;
  });
}
