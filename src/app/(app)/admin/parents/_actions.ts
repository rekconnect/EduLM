"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { ensureFamilyForGuardian } from "@/lib/family";
import { joinName } from "@/lib/names";
import {
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "@/lib/entity-fields";
import { unscopedDb } from "@/lib/db";

const LOCALES = ["fr", "en", "ar"] as const;

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().min(3).max(200),
  password: z.string().min(8).max(128),
  relation: z.string().trim().max(40).optional(),
  locale: z.enum(LOCALES).optional(),
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
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
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
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
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: joinName(parsed.data.firstName, parsed.data.lastName),
        passwordHash,
        role: "PARENT",
        status: "ACTIVE",
        locale: parsed.data.locale ?? "fr",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    const guardian = await db.guardian.create({
      data: { tenantId, userId: created.id, relation: parsed.data.relation ?? null },
      select: { id: true },
    });
    // Auto-create a Family with a unique tenant-scoped code (e.g. "F-0001").
    // The guardian gets linked to it; children added later inherit it.
    await ensureFamilyForGuardian(guardian.id);
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
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
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
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: joinName(parsed.data.firstName, parsed.data.lastName),
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

// ─── Custom answers (Round 6) ──────────────────────────────────

/**
 * Update the parent's tenant-defined custom field answers. The admin form
 * sends every visible field id as a `f-<id>` form entry; we collect those
 * and rebuild the answers JSON, then persist on User.customAnswers.
 *
 * Hidden-by-showIf fields aren't sent at all (the renderer skips them) and
 * we deliberately don't try to preserve previously-stored answers for fields
 * the admin has since removed — that data is orphan and going away.
 */
export async function updateParentCustomAnswers(
  parentUserId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  // Load the tenant's config so we know which field ids are valid.
  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { parentFieldsConfig: true },
  });
  const config: EntityFieldsConfig = parseEntityFieldsConfig(
    tenant?.parentFieldsConfig,
  );
  const validIds = new Set(config.fields.map((f) => f.id));

  const answers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("f-")) continue;
    const fieldId = k.slice(2);
    if (!validIds.has(fieldId)) continue;
    const value = String(v).trim();
    if (value.length === 0) continue;
    if (value.length > 2000) continue; // hard cap
    answers[fieldId] = value;
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.user.update({
      where: { id: parentUserId },
      data: { customAnswers: answers },
    });
  });
  revalidatePath(`/admin/parents/${parentUserId}`);
  return { ok: true };
}
