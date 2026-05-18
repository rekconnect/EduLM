"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { sendAnnouncementEmail } from "@/lib/emails/notifications";

const AUDIENCES = ["ALL_PARENTS", "CLASS", "ACADEMIC_YEAR"] as const;

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  audience: z.enum(AUDIENCES),
  classId: z.string().optional(),
  academicYearId: z.string().optional(),
});

export type AnnouncementFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

export async function createAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = schema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    audience: String(formData.get("audience") ?? "ALL_PARENTS"),
    classId: String(formData.get("classId") ?? "") || undefined,
    academicYearId: String(formData.get("academicYearId") ?? "") || undefined,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  if (parsed.data.audience === "CLASS" && !parsed.data.classId) {
    return { errors: { classId: "required" } };
  }
  if (parsed.data.audience === "ACADEMIC_YEAR" && !parsed.data.academicYearId) {
    return { errors: { academicYearId: "required" } };
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.announcement.create({
      data: {
        tenantId,
        title: parsed.data.title,
        body: parsed.data.body,
        audience: parsed.data.audience,
        classId: parsed.data.audience === "CLASS" ? parsed.data.classId ?? null : null,
        academicYearId:
          parsed.data.audience === "ACADEMIC_YEAR" ? parsed.data.academicYearId ?? null : null,
        publishedByUserId: user.id,
      },
    });
  });

  notifyAudienceOfAnnouncement(
    tenantId,
    parsed.data.title,
    parsed.data.body,
    parsed.data.audience,
    parsed.data.classId,
    parsed.data.academicYearId,
  ).catch((e) => console.error("[email] announcement notify failed:", e));

  revalidatePath("/admin/announcements");
  revalidatePath("/parent/announcements");
  redirect("/admin/announcements");
}

async function notifyAudienceOfAnnouncement(
  tenantId: string,
  title: string,
  body: string,
  audience: (typeof AUDIENCES)[number],
  classId: string | undefined,
  academicYearId: string | undefined,
) {
  const u = unscopedDb();
  try {
    const tenant = await u.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    if (!tenant) return;

    // Resolve which parent users to email based on audience.
    let parentEmails: { email: string; name: string | null }[] = [];
    if (audience === "ALL_PARENTS") {
      parentEmails = await u.user.findMany({
        where: { tenantId, role: "PARENT", status: "ACTIVE" },
        select: { email: true, name: true },
      });
    } else if (audience === "CLASS" && classId) {
      const guardians = await u.user.findMany({
        where: {
          tenantId,
          role: "PARENT",
          status: "ACTIVE",
          guardianProfile: {
            childLinks: {
              some: { student: { enrollments: { some: { classId } } } },
            },
          },
        },
        select: { email: true, name: true },
      });
      parentEmails = guardians;
    } else if (audience === "ACADEMIC_YEAR" && academicYearId) {
      const guardians = await u.user.findMany({
        where: {
          tenantId,
          role: "PARENT",
          status: "ACTIVE",
          guardianProfile: {
            childLinks: {
              some: { student: { enrollments: { some: { academicYearId } } } },
            },
          },
        },
        select: { email: true, name: true },
      });
      parentEmails = guardians;
    }

    if (parentEmails.length === 0) return;

    // Resend allows up to 50 recipients per call. Chunk if needed.
    const CHUNK = 50;
    for (let i = 0; i < parentEmails.length; i += CHUNK) {
      const slice = parentEmails.slice(i, i + CHUNK);
      await sendAnnouncementEmail({
        to: slice,
        tenantName: tenant.name,
        title,
        body,
      });
    }
  } finally {
    await u.$disconnect();
  }
}

export async function markAnnouncementRead(announcementId: string) {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId: user.id } },
      update: {},
      create: { announcementId, userId: user.id },
    });
  });
  revalidatePath("/parent/announcements");
}
