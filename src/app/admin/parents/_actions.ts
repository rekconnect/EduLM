"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const LOCALES = ["fr", "en", "ar"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(200),
  password: z.string().min(8).max(128),
  relation: z.string().trim().max(40).optional(),
  locale: z.enum(LOCALES).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(200),
  relation: z.string().trim().max(40).optional(),
  locale: z.enum(LOCALES).optional(),
});

export type ParentFormState = {
  errors?: Record<string, string>;
  formError?: string;
  newPassword?: string;
};

function genTempPassword(): string {
  // 10-char alphanumeric, no ambiguous chars (no 0/O/1/l/I).
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

export async function createParent(
  _prev: ParentFormState,
  formData: FormData,
): Promise<ParentFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = createSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    relation: String(formData.get("relation") ?? "") || undefined,
    locale: String(formData.get("locale") ?? "fr"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  let newId: string | undefined;
  let conflict = false;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const existing = await db.user.findFirst({
      where: { email: parsed.data.email },
    });
    if (existing) {
      conflict = true;
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const created = await db.user.create({
      data: {
        tenantId,
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: "PARENT",
        status: "ACTIVE",
        locale: parsed.data.locale ?? "fr",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    await db.guardian.create({
      data: { tenantId, userId: created.id, relation: parsed.data.relation ?? null },
    });
    newId = created.id;
  });

  if (conflict) return { errors: { email: "exists" } };
  revalidatePath("/admin/parents");
  redirect(`/admin/parents/${newId}`);
}

export async function updateParent(
  id: string,
  _prev: ParentFormState,
  formData: FormData,
): Promise<ParentFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = updateSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    relation: String(formData.get("relation") ?? "") || undefined,
    locale: String(formData.get("locale") ?? "fr"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  let conflict = false;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Ensure no other user in this tenant has the new email.
    const sameEmail = await db.user.findFirst({
      where: { email: parsed.data.email, NOT: { id } },
      select: { id: true },
    });
    if (sameEmail) {
      conflict = true;
      return;
    }
    await db.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        locale: parsed.data.locale ?? "fr",
      },
    });
    if (parsed.data.relation !== undefined) {
      await db.guardian.upsert({
        where: { userId: id },
        update: { relation: parsed.data.relation || null },
        create: { tenantId, userId: id, relation: parsed.data.relation || null },
      });
    }
  });

  if (conflict) return { errors: { email: "exists" } };
  revalidatePath("/admin/parents");
  revalidatePath(`/admin/parents/${id}`);
  return {};
}

export async function resetParentPassword(parentId: string): Promise<ParentFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };
  const newPassword = genTempPassword();
  await runWithTenant({ tenantId, slug: null }, async () => {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: parentId },
      data: { passwordHash, status: "ACTIVE" },
    });
  });
  revalidatePath(`/admin/parents/${parentId}`);
  return { newPassword };
}

export async function toggleParentStatus(parentId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const cur = await db.user.findUnique({
      where: { id: parentId },
      select: { status: true },
    });
    if (!cur) return;
    const next = cur.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    await db.user.update({ where: { id: parentId }, data: { status: next } });
  });
  revalidatePath(`/admin/parents/${parentId}`);
  revalidatePath("/admin/parents");
}

// ── Guardian links ───────────────────────────────────────────

export async function linkGuardianToStudent(formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  const studentId = String(formData.get("studentId") ?? "");
  const parentUserId = String(formData.get("parentUserId") ?? "");
  const isPrimary = String(formData.get("isPrimary") ?? "") === "on";
  if (!studentId || !parentUserId) return;

  await runWithTenant({ tenantId, slug: null }, async () => {
    // Ensure the parent has a Guardian row.
    let guardian = await db.guardian.findUnique({
      where: { userId: parentUserId },
      select: { id: true },
    });
    if (!guardian) {
      guardian = await db.guardian.create({
        data: { tenantId, userId: parentUserId, relation: "parent" },
        select: { id: true },
      });
    }
    // If isPrimary requested, demote any other primary on this student.
    if (isPrimary) {
      await db.studentGuardian.updateMany({
        where: { studentId },
        data: { isPrimary: false },
      });
    }
    // Idempotent link: upsert on composite PK.
    await db.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
      update: { isPrimary },
      create: { studentId, guardianId: guardian.id, isPrimary },
    });
  });
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/admin/parents/${parentUserId}`);
}

export async function unlinkGuardianFromStudent(studentId: string, parentUserId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const guardian = await db.guardian.findUnique({
      where: { userId: parentUserId },
      select: { id: true },
    });
    if (!guardian) return;
    await db.studentGuardian.deleteMany({
      where: { studentId, guardianId: guardian.id },
    });
  });
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/admin/parents/${parentUserId}`);
}
