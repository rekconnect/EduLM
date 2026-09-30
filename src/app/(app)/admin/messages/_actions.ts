"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import {
  describeAudience,
  notifyParentOfReply,
  notifyParentsOfMessage,
  parentDisplayName,
  resolveAudience,
} from "@/lib/messaging";
import {
  isEmptyAudience,
  parseAudienceSpec,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_BODY_MAX,
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGE_SUBJECT_MAX,
  type AudiencePreview,
  type PickerRecipient,
} from "@/lib/messaging-shared";
import {
  deleteFromStorage,
  isStorageConfigured,
  uploadDocument,
} from "@/lib/storage";

/**
 * Staff side of the messagerie (module "communication").
 *   read  → consult inbox, conversations and sent messages (pages)
 *   write → compose/send, preview/search recipients, reply, close/reopen
 *   full  → send to the WHOLE school, delete a sent message
 * Parent-side actions live in src/app/(app)/parent/messages/_actions.ts.
 */

export type SendResult = { ok: true; broadcastId: string } | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

/** Server actions receive untrusted JSON: an "id" could be a Prisma filter
 *  object ({ not: "" }) that would match every row. Accept plain ids only. */
function isId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
}

const sendSchema = z.object({
  subject: z.string().trim().min(1).max(MESSAGE_SUBJECT_MAX),
  body: z.string().trim().min(1).max(MESSAGE_BODY_MAX),
});

/** Live recipient count for the composer ("→ 57 parents"). */
export async function previewAudience(rawSpec: unknown): Promise<AudiencePreview> {
  const { user } = await requireModuleAccess("communication", "write");
  const spec = parseAudienceSpec(rawSpec);
  if (isEmptyAudience(spec)) return { count: 0, sample: [] };
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const rows = await resolveAudience(spec);
    return { count: rows.length, sample: rows.slice(0, 5).map(parentDisplayName) };
  });
}

/** Search parents (by own name / e-mail, or by a child's name) and families. */
export async function searchRecipients(query: string): Promise<PickerRecipient[]> {
  const { user } = await requireModuleAccess("communication", "write");
  if (typeof query !== "string") return [];
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const [parents, families] = await Promise.all([
      db.user.findMany({
        where: {
          role: "PARENT",
          deletedAt: null,
          archived: false,
          status: { not: "DISABLED" },
          OR: [
            { lastName: contains },
            { firstName: contains },
            { name: contains },
            { email: contains },
            {
              guardianProfile: {
                childLinks: {
                  some: { student: { OR: [{ firstName: contains }, { lastName: contains }] } },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          guardianProfile: {
            select: {
              childLinks: {
                select: { student: { select: { firstName: true, lastName: true } } },
                take: 4,
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 8,
      }),
      db.family.findMany({
        where: { OR: [{ name: contains }, { code: contains }] },
        select: {
          id: true,
          code: true,
          name: true,
          _count: { select: { guardians: true } },
        },
        orderBy: { name: "asc" },
        take: 5,
      }),
    ]);
    const out: PickerRecipient[] = parents.map((p) => {
      const kids = (p.guardianProfile?.childLinks ?? [])
        .map((l) => [l.student.firstName, l.student.lastName].filter(Boolean).join(" "))
        .filter(Boolean);
      return {
        kind: "parent",
        id: p.id,
        label: parentDisplayName(p),
        detail: kids.length ? `Parent de ${kids.join(", ")}` : p.email,
      };
    });
    for (const f of families) {
      out.push({
        kind: "family",
        id: f.id,
        label: `Famille ${f.name ?? f.code}`,
        detail: `${f.code} · ${f._count.guardians} parent${f._count.guardians > 1 ? "s" : ""}`,
      });
    }
    return out;
  });
}

/**
 * Send a message. FormData (attachments are Files): subject, body,
 * allowReplies ("true"/"false"), audience (JSON AudienceSpec), files[].
 * Fans out into one private thread per recipient parent.
 */
export async function sendBroadcast(formData: FormData): Promise<SendResult> {
  const { user, access } = await requireModuleAccess("communication", "write");
  const tenantId = user.tenantId;

  const parsed = sendSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const allowReplies = formData.get("allowReplies") === "true";

  let rawSpec: unknown = {};
  try {
    rawSpec = JSON.parse(String(formData.get("audience") ?? "{}"));
  } catch {
    return { ok: false, error: "invalid" };
  }
  const spec = parseAudienceSpec(rawSpec);
  if (isEmptyAudience(spec)) return { ok: false, error: "no-audience" };
  // Whole-school sends are reserved to "Accès complet".
  if (spec.all && !hasModule(access, "communication", "full")) {
    return { ok: false, error: "forbidden-all" };
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MESSAGE_MAX_ATTACHMENTS) return { ok: false, error: "too-many-files" };
  if (files.some((f) => f.size > MESSAGE_ATTACHMENT_MAX_BYTES)) {
    return { ok: false, error: "file-too-large" };
  }
  if (files.length && !isStorageConfigured()) return { ok: false, error: "no-storage" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const recipients = await resolveAudience(spec);
    if (!recipients.length) return { ok: false, error: "no-recipients" } as const;
    const audienceLabel = await describeAudience(spec);

    const uploaded: { path: string; size: number; mimeType: string; name: string }[] = [];
    try {
      for (const f of files) {
        const up = await uploadDocument(tenantId, f);
        if (up) uploaded.push({ ...up, name: f.name.slice(0, 200) || "fichier" });
      }
    } catch (e) {
      await Promise.all(uploaded.map((u) => deleteFromStorage(u.path).catch(() => {})));
      return {
        ok: false,
        error: e instanceof Error && e.message.startsWith("Type de fichier") ? "file-type" : "upload-failed",
      } as const;
    }

    const now = new Date();
    let broadcastId: string;
    try {
      broadcastId = await db.$transaction(async (tx) => {
    const broadcast = await tx.messageBroadcast.create({
      data: {
        tenantId,
        subject: parsed.data.subject,
        body: parsed.data.body,
        senderUserId: user.id,
        allowReplies,
        audience: spec,
        audienceLabel,
        recipientCount: recipients.length,
      },
      select: { id: true },
    });
    await tx.messageThread.createMany({
      data: recipients.map((r) => ({
        tenantId,
        parentUserId: r.id,
        subject: parsed.data.subject,
        origin: "SCHOOL" as const,
        broadcastId: broadcast.id,
        allowReplies,
        parentUnread: true,
        lastMessageAt: now,
      })),
    });
    if (uploaded.length) {
      await tx.messageAttachment.createMany({
        data: uploaded.map((u) => ({
          tenantId,
          broadcastId: broadcast.id,
          storagePath: u.path,
          fileName: u.name,
          mimeType: u.mimeType,
          sizeBytes: u.size,
        })),
      });
    }
        return broadcast.id;
      }, { timeout: 30_000 });
    } catch (e) {
      // All-or-nothing: no half-created send, no orphaned files in storage.
      await Promise.all(uploaded.map((u) => deleteFromStorage(u.path).catch(() => {})));
      console.error("[messaging] sendBroadcast failed:", e);
      return { ok: false, error: "send-failed" } as const;
    }

    notifyParentsOfMessage({
      tenantId,
      emails: recipients.map((r) => r.email),
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
    revalidatePath("/admin/messages");
    return { ok: true, broadcastId } as const;
  });
}

/** Staff reply inside a parent conversation (reopens a closed thread). */
export async function replyAsSchool(threadId: string, body: string): Promise<ActionResult> {
  const { user } = await requireModuleAccess("communication", "write");
  if (!isId(threadId) || typeof body !== "string") return { ok: false, error: "invalid" };
  const text = (body ?? "").trim();
  if (!text || text.length > MESSAGE_BODY_MAX) return { ok: false, error: "invalid" };
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const thread = await db.messageThread.findFirst({
      where: { id: threadId },
      select: { id: true, subject: true, parent: { select: { email: true } } },
    });
    if (!thread) return { ok: false, error: "not-found" } as const;
    const now = new Date();
    await db.$transaction(async (tx) => {
    await tx.messagePost.create({
      data: {
        tenantId: user.tenantId,
        threadId,
        authorUserId: user.id,
        fromSchool: true,
        body: text,
      },
    });
    await tx.messageThread.update({
      where: { id: threadId, tenantId: user.tenantId },
      data: {
        lastMessageAt: now,
        parentUnread: true,
        schoolUnread: false,
        schoolReadAt: now,
        schoolReadByUserId: user.id,
        status: "OPEN",
        closedAt: null,
      },
    });
    });
    notifyParentOfReply({
      tenantId: user.tenantId,
      threadId,
      email: thread.parent.email,
      subject: thread.subject,
      body: text,
    });
    revalidatePath(`/admin/messages/${threadId}`);
    revalidatePath("/admin/messages");
    return { ok: true } as const;
  });
}

export async function setThreadStatus(
  threadId: string,
  status: "OPEN" | "CLOSED",
): Promise<ActionResult> {
  const { user } = await requireModuleAccess("communication", "write");
  if (!isId(threadId) || (status !== "OPEN" && status !== "CLOSED")) {
    return { ok: false, error: "invalid" };
  }
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const res = await db.messageThread.updateMany({
      where: { id: threadId },
      data:
        status === "CLOSED"
          ? { status: "CLOSED", closedAt: new Date(), schoolUnread: false }
          : { status: "OPEN", closedAt: null },
    });
    if (!res.count) return { ok: false, error: "not-found" } as const;
    revalidatePath(`/admin/messages/${threadId}`);
    revalidatePath("/admin/messages");
    return { ok: true } as const;
  });
}

/** Delete a sent message with every conversation + attachment it created. */
export async function deleteBroadcast(broadcastId: string): Promise<ActionResult> {
  const { user } = await requireModuleAccess("communication", "full");
  if (!isId(broadcastId)) return { ok: false, error: "invalid" };
  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const b = await db.messageBroadcast.findFirst({
      where: { id: broadcastId },
      select: { id: true, attachments: { select: { storagePath: true } } },
    });
    if (!b) return { ok: false, error: "not-found" } as const;
    await db.messageBroadcast.delete({ where: { id: broadcastId } });
    await Promise.all(
      b.attachments.map((a) => deleteFromStorage(a.storagePath).catch(() => {})),
    );
    revalidatePath("/admin/messages");
    return { ok: true } as const;
  });
}
