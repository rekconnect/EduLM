"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { uploadDocument, deleteFromStorage, isStorageConfigured } from "@/lib/storage";

const CATEGORIES = ["REGULATION", "CALENDAR", "FORM", "NEWSLETTER", "OTHER"] as const;
const AUDIENCES = ["ALL_PARENTS", "CLASS", "ACADEMIC_YEAR"] as const;

const baseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional(),
  category: z.enum(CATEGORIES),
  audience: z.enum(AUDIENCES),
  classId: z.string().optional(),
  academicYearId: z.string().optional(),
  requiresAck: z.string().optional().transform((v) => v === "on" || v === "true"),
  externalUrl: z.string().url().optional(),
});

export type DocumentFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

export async function createDocument(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const file = formData.get("file");
  const externalUrlRaw = String(formData.get("externalUrl") ?? "").trim() || undefined;

  const parsed = baseSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    category: String(formData.get("category") ?? "OTHER"),
    audience: String(formData.get("audience") ?? "ALL_PARENTS"),
    classId: String(formData.get("classId") ?? "") || undefined,
    academicYearId: String(formData.get("academicYearId") ?? "") || undefined,
    requiresAck: String(formData.get("requiresAck") ?? ""),
    externalUrl: externalUrlRaw,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  // Need at least one of file (with storage configured) or externalUrl.
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !parsed.data.externalUrl) {
    return { errors: { file: "either-file-or-url" } };
  }
  if (hasFile && !isStorageConfigured()) {
    return { formError: "no-storage" };
  }

  // Audience-specific validation.
  if (parsed.data.audience === "CLASS" && !parsed.data.classId) {
    return { errors: { classId: "required-for-class-audience" } };
  }
  if (parsed.data.audience === "ACADEMIC_YEAR" && !parsed.data.academicYearId) {
    return { errors: { academicYearId: "required-for-year-audience" } };
  }

  let storagePath: string | null = null;
  let fileSizeBytes: number | null = null;
  let mimeType: string | null = null;
  if (hasFile) {
    try {
      const result = await uploadDocument(tenantId, file as File);
      if (!result) return { formError: "no-storage" };
      storagePath = result.path;
      fileSizeBytes = result.size;
      mimeType = result.mimeType;
    } catch (e) {
      return { formError: `upload-failed: ${(e as Error).message}` };
    }
  }

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const created = await db.tenantDocument.create({
      data: {
        tenantId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        category: parsed.data.category,
        audience: parsed.data.audience,
        classId: parsed.data.audience === "CLASS" ? parsed.data.classId ?? null : null,
        academicYearId:
          parsed.data.audience === "ACADEMIC_YEAR" ? parsed.data.academicYearId ?? null : null,
        requiresAck: parsed.data.requiresAck,
        storagePath,
        externalUrl: storagePath ? null : parsed.data.externalUrl ?? null,
        fileSizeBytes,
        mimeType,
        uploadedByUserId: user.id,
      },
      select: { id: true },
    });
    newId = created.id;
  });

  revalidatePath("/admin/documents");
  revalidatePath("/parent/documents");
  redirect(`/admin/documents/${newId}`);
}

export async function deleteDocument(id: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;

  let pathToRemove: string | null = null;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const doc = await db.tenantDocument.findUnique({
      where: { id },
      select: { storagePath: true },
    });
    pathToRemove = doc?.storagePath ?? null;
    await db.tenantDocument.delete({ where: { id } });
  });
  if (pathToRemove) {
    try {
      await deleteFromStorage(pathToRemove);
    } catch {
      // Storage deletion failure is non-fatal — DB row is already gone.
    }
  }
  revalidatePath("/admin/documents");
  revalidatePath("/parent/documents");
  redirect("/admin/documents");
}

export async function acknowledgeDocument(documentId: string) {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Verify the doc is targeted at this parent.
    const doc = await db.tenantDocument.findUnique({
      where: { id: documentId },
      select: { id: true, audience: true, classId: true, academicYearId: true },
    });
    if (!doc) return;
    // Upsert is idempotent (unique on documentId+userId).
    await db.documentAcknowledgment.upsert({
      where: { documentId_userId: { documentId, userId: user.id } },
      update: {},
      create: { documentId, userId: user.id },
    });
  });
  revalidatePath("/parent/documents");
}
