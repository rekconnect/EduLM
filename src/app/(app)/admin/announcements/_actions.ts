"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { notifyParentsOfMessage, resolveAudience } from "@/lib/messaging";
import {
  isEmptyAudience,
  parseAudienceSpec,
  MESSAGE_BODY_MAX,
  MESSAGE_SUBJECT_MAX,
} from "@/lib/messaging-shared";

/**
 * Announcement board (module "communication").
 *   write → publish an announcement to a targeted audience
 *   full  → publish to the WHOLE school (spec.all)
 *
 * The audience is the same AudienceSpec as the messagerie, stored in
 * Announcement.audienceSpec, and the parents it resolved to at publish time
 * are snapshotted in AnnouncementRecipient — the parent board shows it to
 * exactly those parents (a later year switch / class change / withdrawal can
 * never re-route it). The legacy audience/classId/academicYearId trio is
 * always written as CLASS + null, which every legacy filter matches to
 * nobody — so no old code path can ever show it to every parent.
 */

const schema = z.object({
  title: z.string().trim().min(1).max(MESSAGE_SUBJECT_MAX),
  body: z.string().trim().min(1).max(MESSAGE_BODY_MAX),
});

export type AnnouncementFormState = {
  /** Field → error code ("required" | "tooLong" | "noAudience"); the form translates it. */
  errors?: Record<string, string>;
  /** Form-level error code ("forbiddenAll" | "noRecipients" | "invalid"). */
  formError?: string;
  /** Echo of the submitted text so React's post-action form reset keeps it. */
  values?: { title: string; body: string };
};

export async function createAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const { user, access } = await requireModuleAccess("communication", "write");
  const tenantId = user.tenantId;

  const values = {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  };

  const errors: Record<string, string> = {};
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (!field || errors[field]) continue;
      errors[field] = issue.code === "too_big" ? "tooLong" : "required";
    }
  }

  let rawSpec: unknown = {};
  try {
    rawSpec = JSON.parse(String(formData.get("audienceSpec") ?? "{}"));
  } catch {
    rawSpec = {};
  }
  const spec = parseAudienceSpec(rawSpec);
  if (isEmptyAudience(spec)) errors.audienceSpec = "noAudience";

  if (!parsed.success || Object.keys(errors).length) {
    return { errors, values };
  }
  // Whole-school announcements are reserved to "Accès complet".
  if (spec.all && !hasModule(access, "communication", "full")) {
    return { formError: "forbiddenAll", values };
  }

  const { title, body } = parsed.data;

  const recipientCount = await runWithTenant({ tenantId, slug: null }, async () => {
    // Same resolution as the messagerie: current enrollments of the active
    // year + explicit families/parents; disabled/archived accounts excluded.
    const recipients = await resolveAudience(spec);
    if (!recipients.length) return 0;

    await db.$transaction(async (tx) => {
      const ann = await tx.announcement.create({
        data: {
          tenantId,
          title,
          body,
          audienceSpec: spec,
          audience: "CLASS",
          classId: null,
          academicYearId: null,
          publishedByUserId: user.id,
        },
        select: { id: true },
      });
      await tx.announcementRecipient.createMany({
        data: recipients.map((r) => ({
          tenantId,
          announcementId: ann.id,
          userId: r.id,
        })),
        skipDuplicates: true,
      });
    });

    // One private email per parent (never a shared To: list), sent after
    // the response so a large audience doesn't delay the redirect.
    notifyParentsOfMessage({
      tenantId,
      emails: recipients.map((r) => r.email),
      subject: title,
      body,
      kind: "announcement",
    });
    return recipients.length;
  });

  if (!recipientCount) return { formError: "noRecipients", values };

  revalidatePath("/admin/announcements");
  revalidatePath("/parent/announcements");
  redirect(`/admin/announcements?published=${recipientCount}`);
}

export async function markAnnouncementRead(announcementId: string) {
  if (typeof announcementId !== "string" || !announcementId || announcementId.length > 64) return;
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Tenant-scoped lookup + recipient check for targeted announcements, so a
    // read receipt can't be created for an announcement this parent never got.
    const visible = await db.announcement.findFirst({
      where: {
        id: announcementId,
        OR: [
          { audienceSpec: { equals: Prisma.DbNull } },
          { recipients: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });
    if (!visible) return;
    await db.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId: user.id } },
      update: {},
      create: { announcementId, userId: user.id },
    });
  });
  revalidatePath("/parent/announcements");
}
