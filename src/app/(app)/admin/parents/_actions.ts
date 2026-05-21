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

// firstName/lastName/relation are now `.optional()` because the tenant
// config can drop them or relax to "optional" — we re-validate against
// the live config inside createParent so required ones still error if
// missing. email + password remain non-negotiable.
const createSchema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
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

  // Load the tenant's create-form config so we can apply the right
  // required-ness checks for built-in fields and pull out any custom
  // answers expected by this tenant.
  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { parentCreateFieldsConfig: true },
  });
  const { parseParentCreateConfig } = await import(
    "@/lib/parent-create-config"
  );
  const config = parseParentCreateConfig(tenant?.parentCreateFieldsConfig);

  const parsed = createSchema.safeParse({
    firstName: String(formData.get("firstName") ?? "").trim() || undefined,
    lastName: String(formData.get("lastName") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    relation: String(formData.get("relation") ?? "").trim() || undefined,
    locale: String(formData.get("locale") ?? "fr"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  // Enforce per-tenant required built-ins. Email + password are caught
  // by the schema; the four optional standards (firstName, lastName,
  // relation, locale) need a manual check against the config.
  const builtinErrors: Record<string, string> = {};
  if (config.builtin.firstName === "required" && !parsed.data.firstName)
    builtinErrors.firstName = "required";
  if (config.builtin.lastName === "required" && !parsed.data.lastName)
    builtinErrors.lastName = "required";
  if (config.builtin.relation === "required" && !parsed.data.relation)
    builtinErrors.relation = "required";
  if (
    config.builtin.locale === "required" &&
    !(parsed.data.locale && parsed.data.locale.length > 0)
  )
    builtinErrors.locale = "required";
  if (Object.keys(builtinErrors).length > 0) return { errors: builtinErrors };

  // Collect custom answers per the tenant config. Only active fields
  // are accepted; unknown keys are ignored. Required-missing fails the
  // request with a per-field error.
  const customAnswers: Record<string, string> = {};
  const customErrors: Record<string, string> = {};
  for (const f of config.fields) {
    if (f.active === false) continue;
    const raw = String(formData.get(`f-${f.id}`) ?? "").trim();
    if (raw.length === 0) {
      if (f.required) customErrors[`f-${f.id}`] = "required";
      continue;
    }
    if (raw.length > 2000) continue; // hard cap defensively
    customAnswers[f.id] = raw;
  }
  if (Object.keys(customErrors).length > 0) return { errors: customErrors };

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
        firstName: parsed.data.firstName ?? null,
        lastName: parsed.data.lastName ?? null,
        name:
          joinName(
            parsed.data.firstName ?? "",
            parsed.data.lastName ?? "",
          ) || null,
        passwordHash,
        role: "PARENT",
        status: "ACTIVE",
        locale: parsed.data.locale ?? "fr",
        emailVerified: new Date(),
        customAnswers,
      },
      select: { id: true },
    });
    const guardian = await db.guardian.create({
      data: {
        tenantId,
        userId: created.id,
        relation: parsed.data.relation ?? null,
      },
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

// ── Archive / soft-delete / restore (admin row actions) ─────
// Same three-state lifecycle as admissions:
//   active → archived → deleted → permanently deleted
// Archive and soft-delete only hide the parent from the default list.
// Permanent delete is destructive: removes the User row and cascades
// (Guardian, child links, applications, etc.). It refuses if the parent
// still has any non-deleted students/applications to avoid orphaning kids.

type ParentBulkResult = { ok: boolean; processed: number; skipped: number };

/** Move a parent into/out of the Archived section. */
export async function setParentArchived(
  parentUserId: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT" },
      select: { id: true },
    });
    if (!parent) return { ok: false, error: "not-found" };
    await db.user.update({
      where: { id: parentUserId },
      data: {
        archived,
        archivedAt: archived ? new Date() : null,
        deletedAt: null,
      },
    });
    revalidatePath("/admin/parents");
    revalidatePath(`/admin/parents/${parentUserId}`);
    return { ok: true };
  });
}

/**
 * Soft delete — tombstones the parent so they disappear from the active
 * + archived lists and stay only in Deleted (recoverable). Does NOT touch
 * their children, applications, or auth — those still exist until a
 * permanent delete.
 */
export async function softDeleteParent(
  parentUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT" },
      select: { id: true },
    });
    if (!parent) return { ok: false, error: "not-found" };
    await db.user.update({
      where: { id: parentUserId },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/admin/parents");
    revalidatePath(`/admin/parents/${parentUserId}`);
    return { ok: true };
  });
}

/** Restore a parent back to Active (clears both archived and deleted). */
export async function restoreParent(
  parentUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT" },
      select: { id: true },
    });
    if (!parent) return { ok: false, error: "not-found" };
    await db.user.update({
      where: { id: parentUserId },
      data: { deletedAt: null, archived: false, archivedAt: null },
    });
    revalidatePath("/admin/parents");
    revalidatePath(`/admin/parents/${parentUserId}`);
    return { ok: true };
  });
}

/**
 * Permanently delete — removes the User row. FK cascades take care of
 * Guardian, sessions, submitted apps (when no resultingStudent), etc.
 * Refuses if the parent still has any linked Student that is not also
 * being deleted, since that would orphan the kid.
 */
export async function permanentlyDeleteParent(
  parentUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT" },
      select: {
        id: true,
        guardianProfile: {
          select: { _count: { select: { childLinks: true } } },
        },
      },
    });
    if (!parent) return { ok: false, error: "not-found" };
    if ((parent.guardianProfile?._count.childLinks ?? 0) > 0) {
      return { ok: false, error: "has-children" };
    }
    await db.user.delete({ where: { id: parentUserId } });
    revalidatePath("/admin/parents");
    return { ok: true };
  });
}

// ── Bulk variants ──────────────────────────────────────────

async function withParentTenant<T>(
  ids: string[],
  fn: (tenantId: string) => Promise<T>,
): Promise<T | { ok: false; processed: 0; skipped: 0 }> {
  if (ids.length === 0) {
    return { ok: false, processed: 0, skipped: 0 } as unknown as T;
  }
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) {
    return { ok: false, processed: 0, skipped: 0 } as unknown as T;
  }
  return runWithTenant({ tenantId, slug: null }, () => fn(tenantId));
}

export async function bulkSetParentsArchived(
  ids: string[],
  archived: boolean,
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async () => {
    const r = await db.user.updateMany({
      where: { id: { in: ids }, role: "PARENT" },
      data: {
        archived,
        archivedAt: archived ? new Date() : null,
        deletedAt: null,
      },
    });
    revalidatePath("/admin/parents");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<ParentBulkResult>;
}

export async function bulkSoftDeleteParents(
  ids: string[],
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async () => {
    const r = await db.user.updateMany({
      where: { id: { in: ids }, role: "PARENT" },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/admin/parents");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<ParentBulkResult>;
}

export async function bulkRestoreParents(
  ids: string[],
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async () => {
    const r = await db.user.updateMany({
      where: { id: { in: ids }, role: "PARENT" },
      data: { deletedAt: null, archived: false, archivedAt: null },
    });
    revalidatePath("/admin/parents");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<ParentBulkResult>;
}

/**
 * Bulk permanent delete: only purges parents who have zero linked kids
 * (since orphaning a Student would lose data). Others are skipped and
 * counted in the toast — admin can clean those up by-hand.
 */
export async function bulkPermanentlyDeleteParents(
  ids: string[],
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async () => {
    // Pre-filter: keep only parents with no kids linked through Guardian.
    const purgeable = await db.user.findMany({
      where: {
        id: { in: ids },
        role: "PARENT",
        OR: [
          { guardianProfile: null },
          { guardianProfile: { childLinks: { none: {} } } },
        ],
      },
      select: { id: true },
    });
    const purgeableIds = purgeable.map((p) => p.id);
    let processed = 0;
    if (purgeableIds.length > 0) {
      const r = await db.user.deleteMany({
        where: { id: { in: purgeableIds }, role: "PARENT" },
      });
      processed = r.count;
    }
    revalidatePath("/admin/parents");
    return { ok: true, processed, skipped: ids.length - processed };
  }) as Promise<ParentBulkResult>;
}
