"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import {
  PROVENANCE_SELECT,
  hasProvenance,
  isStaffDomainEmail,
  moveAdminGrantEmail,
  staffDomainsFor,
  staffIdentityGuard,
} from "@/lib/staff-identity";
import {
  ensureFamilyForGuardian,
  giveGuardianOwnFamily,
  placeGuardianWithStudent,
  type FamilyPlacement,
} from "@/lib/family";
import { householdAnswerFields, storedAnswer } from "@/lib/entity-fields";
import { loadEntityFieldsConfig } from "../../settings/_actions";
import { hardDeleteParentAccounts } from "@/lib/parent-hard-delete";
import { restartSignupCountdownFor } from "@/lib/signup-retention";
import { joinName } from "@/lib/names";
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

const identitySchema = z.object({
  isLebanese: z.enum(["yes", "no", ""]).optional(),
  passportLebanese: z.string().trim().max(40).optional(),
  nationality1: z.string().trim().max(80).optional(),
  nationality2: z.string().trim().max(80).optional(),
  monoParental: z.enum(["yes", "no"]).optional(),
});

export type ParentIdentityFormState = {
  ok?: boolean;
  formError?: string;
};

/**
 * Update the parent's "Identité du responsable" data — Lebanese Y/N,
 * Lebanese passport, Nationalité 1/2, Famille monoparentale.
 *
 * Canonical storage is on Guardian (parent-level identity facts that
 * outlive any single application). Admin edits propagate to every
 * existing Application's submitter* columns so historic dossiers stay
 * consistent. New parents work too — Guardian is upserted so the
 * record is created if missing, and createDossier reads from Guardian
 * to pre-fill the first application.
 */
export async function updateParentIdentity(
  parentId: string,
  _prev: ParentIdentityFormState,
  formData: FormData,
): Promise<ParentIdentityFormState> {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = identitySchema.safeParse({
    isLebanese: String(formData.get("isLebanese") ?? ""),
    passportLebanese: String(formData.get("passportLebanese") ?? ""),
    nationality1: String(formData.get("nationality1") ?? ""),
    nationality2: String(formData.get("nationality2") ?? ""),
    monoParental: String(formData.get("monoParental") ?? "no") || undefined,
  });
  if (!parsed.success) return { formError: "validation" };

  const lebaneseValue =
    parsed.data.isLebanese === "yes"
      ? true
      : parsed.data.isLebanese === "no"
        ? false
        : null;
  const monoValue = parsed.data.monoParental === "yes";
  // Wipe the Lebanese-passport column when not Lebanese, so we don't
  // leave stale values from when the radio was "Oui".
  const persistedPassport =
    lebaneseValue === true ? parsed.data.passportLebanese || null : null;

  let notFound = false;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Same rule as every other PARENT-targeting write: PARENT accounts only,
    // and never a hat-holder for non-admins (its Guardian row is staff identity).
    const target = await db.user.findFirst({
      where: { id: parentId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
      select: { id: true },
    });
    if (!target) {
      notFound = true;
      return;
    }
    // Guardian is the canonical store — admin can set identity here
    // even when the parent has no application yet. Upsert (create if
    // missing) so new parents work as expected.
    await db.guardian.upsert({
      where: { userId: parentId },
      update: {
        isLebanese: lebaneseValue,
        passportLebanese: persistedPassport,
        nationality1: parsed.data.nationality1 || null,
        nationality2: parsed.data.nationality2 || null,
        monoParental: monoValue,
      },
      create: {
        tenantId,
        userId: parentId,
        isLebanese: lebaneseValue,
        passportLebanese: persistedPassport,
        nationality1: parsed.data.nationality1 || null,
        nationality2: parsed.data.nationality2 || null,
        monoParental: monoValue,
      },
    });
    // Propagate to existing applications so the dossier-side display
    // also reflects the change. No-op when there are no apps yet —
    // that's fine, the Guardian record alone is enough until the
    // parent creates their first dossier (createDossier reads from
    // Guardian to pre-fill).
    await db.application.updateMany({
      where: { submittedByUserId: parentId },
      data: {
        submitterIsLebanese: lebaneseValue,
        submitterPassportLebanese: persistedPassport,
        submitterNationality: parsed.data.nationality1 || null,
        submitterNationality2: parsed.data.nationality2 || null,
        monoParental: monoValue,
      },
    });
  });

  // Nothing was written: say so instead of confirming a save.
  if (notFound) return { formError: "not-found" };
  revalidatePath(`/admin/parents/${parentId}`);
  return { ok: true };
}


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

/**
 * A parent who just joined a family code receives the household answers that
 * code's parents hold (building, floor, caza… — the address details stored on
 * each responsable), wherever they have none of their own. The screens read
 * those details from the code's first parent (père first): without this, a
 * newly added father would come first and the address block would go blank.
 * Never overwrites a value the joining parent already has.
 */
async function inheritHouseholdAnswers(
  joinerUserId: string,
  familyCode: string,
): Promise<void> {
  const fields = householdAnswerFields(await loadEntityFieldsConfig("parent"));
  if (fields.length === 0) return;
  const members = await db.guardian.findMany({
    where: { family: { code: familyCode }, NOT: { userId: joinerUserId } },
    select: { id: true, relation: true, user: { select: { customAnswers: true } } },
  });
  if (members.length === 0) return;
  // Same order as the family page: père, mère, then the others.
  const rank = (r: string | null) => (r === "pere" ? 0 : r === "mere" ? 1 : 2);
  members.sort(
    (a, b) => rank(a.relation) - rank(b.relation) || a.id.localeCompare(b.id),
  );
  const asRecord = (raw: unknown): Record<string, unknown> =>
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const holder = asRecord(members[0]?.user.customAnswers);
  const joiner = await db.user.findUnique({
    where: { id: joinerUserId },
    select: { customAnswers: true },
  });
  if (!joiner) return;
  const mine: Record<string, unknown> = { ...asRecord(joiner.customAnswers) };
  let changed = false;
  for (const f of fields) {
    const theirs = storedAnswer(holder, f).trim();
    if (!theirs || storedAnswer(mine, f).trim()) continue;
    mine[f.key] = theirs;
    if (f.id !== f.key) mine[f.id] = theirs;
    changed = true;
  }
  if (changed) {
    await db.user.update({
      where: { id: joinerUserId },
      data: { customAnswers: mine as Prisma.InputJsonValue },
    });
  }
}

export async function createParent(
  _prev: ParentFormState,
  formData: FormData,
): Promise<ParentFormState> {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantIdForDomain = user.tenantId;
  {
    const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
    if (
      emailRaw &&
      user.role !== "SCHOOL_ADMIN" &&
      tenantIdForDomain &&
      isStaffDomainEmail(emailRaw, await staffDomainsFor(tenantIdForDomain))
    ) {
      return { errors: { email: "staffDomain" } };
    }
  }
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

  // Opened from a child's page ("créer un parent et le lier"): the new parent
  // is linked to that child and recorded under the child's family code.
  const linkStudentId = String(formData.get("studentId") ?? "").trim();

  let newId: string | undefined;
  let conflict = false;
  let linkedStudentId = "";
  await runWithTenant({ tenantId, slug: null }, async () => {
    const existing = await db.user.findFirst({
      where: { email: parsed.data.email },
    });
    if (existing) {
      conflict = true;
      return;
    }
    // Tenant-scoped lookup: an id from another school matches nothing.
    const linkStudent = linkStudentId
      ? await db.student.findUnique({
          where: { id: linkStudentId },
          select: { id: true },
        })
      : null;
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
    if (linkStudent) {
      // A child's first parent is its "parent principal".
      const hasPrincipal = await db.studentGuardian.count({
        where: { studentId: linkStudent.id, isPrimary: true },
      });
      await db.studentGuardian.create({
        data: {
          studentId: linkStudent.id,
          guardianId: guardian.id,
          isPrimary: hasPrincipal === 0,
        },
      });
      // A brand-new account has nothing of its own: it joins the child's
      // family code (no new code is used up). The account and the link are
      // already saved, so a failure here is logged rather than thrown.
      try {
        const placement = await placeGuardianWithStudent(guardian.id, linkStudent.id);
        if (placement.kind === "moved") {
          await inheritHouseholdAnswers(created.id, placement.code);
        }
      } catch (err) {
        console.error("[createParent] family placement failed", err);
      }
      linkedStudentId = linkStudent.id;
    } else {
      // A parent created on its own gets a family code of its own; linking a
      // child later moves the parent under that child's code.
      await ensureFamilyForGuardian(guardian.id);
    }
    newId = created.id;
  });

  if (conflict) return { errors: { email: "exists" } };
  revalidatePath("/admin/parents");
  if (linkedStudentId) {
    revalidatePath(`/students/${linkedStudentId}`);
    redirect(`/students/${linkedStudentId}`);
  }
  redirect(`/admin/parents/${newId}`);
}

export async function updateParent(
  id: string,
  _prev: ParentFormState,
  formData: FormData,
): Promise<ParentFormState> {
  const { user } = await requireModuleAccess("eleves", "write");
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
  let notParent = false;
  let staffDomain = false;
  let previousEmail: string | null = null;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Guard: only PARENT accounts — an admin must not edit a peer admin by id
    // (User is tenant-scoped but not role-scoped).
    const parent = await db.user.findFirst({
      where: { id, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
      select: {
        id: true,
        email: true,
        guardianProfile: { select: { relation: true } },
      },
    });
    if (!parent) {
      notParent = true;
      return;
    }
    // A school staff address on a parent record is an admin-only decision
    // (it is the trust anchor for the double profil).
    if (
      user.role !== "SCHOOL_ADMIN" &&
      isStaffDomainEmail(parsed.data.email, await staffDomainsFor(tenantId))
    ) {
      staffDomain = true;
      return;
    }
    // Ensure no other user in this tenant has the new email.
    const sameEmail = await db.user.findFirst({
      where: { email: parsed.data.email, NOT: { id } },
      select: { id: true },
    });
    if (sameEmail) {
      conflict = true;
      return;
    }
    previousEmail = parent.email;
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
    // Only when the admin picked another relation. The form always posts the
    // stored one back, and re-writing it would also overwrite the relation
    // recorded on each of this parent's dossiers, which can legitimately be
    // more precise (a grandmother's dossier vs. a generic stored value).
    if (
      parsed.data.relation !== undefined &&
      parsed.data.relation !== (parent.guardianProfile?.relation ?? "")
    ) {
      await db.guardian.upsert({
        where: { userId: id },
        update: { relation: parsed.data.relation || null },
        create: { tenantId, userId: id, relation: parsed.data.relation || null },
      });
      // Sync to the parent's most recent application so the dossier-
      // side display (Application.submitterRelation) reflects the new
      // value. Without this, the relation row on /admin/parents/{id}
      // appears to "not change" because it prefers the dossier value
      // when both are set.
      await db.application.updateMany({
        where: { submittedByUserId: id },
        data: { submitterRelation: parsed.data.relation || null },
      });
    }
  });

  if (notParent) return { formError: "not-found" };
  if (staffDomain) return { errors: { email: "staffDomain" } };
  if (conflict) return { errors: { email: "exists" } };
  if (previousEmail && previousEmail !== parsed.data.email) {
    await moveAdminGrantEmail(tenantId, previousEmail, parsed.data.email);
  }
  revalidatePath("/admin/parents");
  revalidatePath(`/admin/parents/${id}`);
  return {};
}

export async function resetParentPassword(parentId: string): Promise<ParentFormState> {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };
  const newPassword = genTempPassword();
  const state = await runWithTenant({ tenantId, slug: null }, async () => {
    // Guard: only PARENT accounts — never let an admin reset a peer admin's
    // password by passing their id (User is tenant-scoped but not role-scoped).
    const parent = await db.user.findFirst({
      where: { id: parentId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
      select: { id: true },
    });
    if (!parent) return { formError: "not-found" } satisfies ParentFormState;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: parentId },
      // Temp password opens the door once — own password required at first
      // sign-in (same behavior as the /admin/accounts console).
      data: { passwordHash, status: "ACTIVE", mustChangePassword: true, sessionsInvalidBefore: new Date() },
    });
    return { newPassword } satisfies ParentFormState;
  });
  revalidatePath(`/admin/parents/${parentId}`);
  return state;
}

export async function toggleParentStatus(parentId: string) {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const cur = await db.user.findFirst({
      where: { id: parentId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
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

/** What linking did; `placement` tells whether the parent changed family code. */
export type LinkGuardianResult = {
  ok: boolean;
  placement: FamilyPlacement | null;
};

export async function linkGuardianToStudent(
  formData: FormData,
): Promise<LinkGuardianResult> {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantId = user.tenantId;
  const refused: LinkGuardianResult = { ok: false, placement: null };
  if (!tenantId) return refused;
  const studentId = String(formData.get("studentId") ?? "");
  const parentUserId = String(formData.get("parentUserId") ?? "");
  const isPrimary = String(formData.get("isPrimary") ?? "") === "on";
  if (!studentId || !parentUserId) return refused;

  const result = await runWithTenant({ tenantId, slug: null }, async () => {
    // Only PARENT accounts carry a Guardian: never attach children to a
    // staff or admin account by id. A child link is also the double-profil
    // provenance signal, so for non-admins a parent on a STAFF e-mail domain
    // must already be verified (Dars / Microsoft) before it can be linked.
    // A child link is the double-profil provenance signal, so for non-admins a
    // parent on a STAFF e-mail domain must already be verified by the shared
    // rule (Dars, or Microsoft-linked AND password-less) before linking.
    const target = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT" },
      select: { id: true, email: true, ...PROVENANCE_SELECT },
    });
    if (!target) return refused;
    // The link table carries no tenant column: make sure the child is one of
    // this school's before writing to it.
    const child = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!child) return refused;
    if (
      user.role !== "SCHOOL_ADMIN" &&
      !hasProvenance(target) &&
      isStaffDomainEmail(target.email, await staffDomainsFor(tenantId))
    ) {
      return refused;
    }
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
    // One family code per child: a parent with nothing under a code of their
    // own joins the child's (see placeGuardianWithStudent, which leaves the
    // parent where they are whenever something could be lost). The link
    // itself is already saved, so a failure here is logged rather than
    // thrown; the result goes back to the screen, which says what moved.
    let placement: FamilyPlacement | null = null;
    try {
      placement = await placeGuardianWithStudent(guardian.id, studentId);
      if (placement.kind === "moved") {
        await inheritHouseholdAnswers(parentUserId, placement.code);
      }
    } catch (err) {
      console.error("[linkGuardianToStudent] family placement failed", err);
    }
    return { ok: true, placement } satisfies LinkGuardianResult;
  });
  revalidatePath(`/students/${studentId}`);
  // Family membership may have changed: every page of the section shows it.
  revalidatePath("/admin/parents", "layout");
  return result;
}

/**
 * Take a parent out of the family code they sit under and give them a new one
 * of their own. The way back when a link placed a parent under the wrong
 * family. Children and links are untouched: only this parent's code changes.
 */
export async function separateParentFamilyCode(
  parentUserId: string,
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const result = await runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.user.findFirst({
      where: {
        id: parentUserId,
        role: "PARENT",
        ...(await staffIdentityGuard(user, tenantId)),
      },
      select: { guardianProfile: { select: { id: true, familyId: true } } },
    });
    const g = target?.guardianProfile;
    if (!g) return { ok: false, error: "not-found" };
    if (g.familyId) {
      // Alone under a code already: there is nothing to separate from.
      const [others, children] = await Promise.all([
        db.guardian.count({ where: { familyId: g.familyId, NOT: { id: g.id } } }),
        db.student.count({ where: { familyId: g.familyId } }),
      ]);
      if (others === 0 && children === 0) return { ok: false, error: "already-alone" };
    }
    const family = await giveGuardianOwnFamily(g.id);
    if (!family) return { ok: false, error: "not-found" };
    return { ok: true, code: family.code };
  });
  if (result.ok) revalidatePath("/admin/parents", "layout");
  return result;
}

export async function unlinkGuardianFromStudent(studentId: string, parentUserId: string) {
  const { user } = await requireModuleAccess("eleves", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
      select: { id: true },
    });
    if (!target) return;
    const guardian = await db.guardian.findUnique({
      where: { userId: parentUserId },
      select: { id: true },
    });
    if (!guardian) return;
    // Losing its child link can turn a self-registered account back into an
    // "abandoned sign-up": it then gets a fresh, full automatic-deletion
    // countdown (with the other responsables of its family) instead of being
    // due the same night. Done BEFORE the unlink: if it fails, nothing changes.
    await restartSignupCountdownFor(tenantId, [parentUserId]);
    await db.studentGuardian.deleteMany({
      where: { studentId, guardianId: guardian.id },
    });
  });
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/admin/parents/${parentUserId}`);
}

// ─── Custom answers (Round 6) ──────────────────────────────────

// ── Archive / soft-delete / restore (admin row actions) ─────
// Same three-state lifecycle as admissions:
//   active → archived → deleted → permanently deleted
// Archive and soft-delete only hide the parent from the default list.
// Permanent delete is destructive: removes the User row and cascades
// (Guardian, child links, applications, etc.). It refuses if the parent
// still has any non-deleted students/applications to avoid orphaning kids.

type ParentBulkResult = { ok: boolean; processed: number; skipped: number };

/** Same shape as ParentBulkResult plus the one skip reason the UI explains. */
export type ParentPurgeResult = ParentBulkResult & {
  /** Skipped because a non-DRAFT dossier exists — admissions owns those. */
  skippedHasDossier: number;
};

/** Move a parent into/out of the Archived section. */
export async function setParentArchived(
  parentUserId: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireModuleAccess("eleves", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
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
  const { user } = await requireModuleAccess("eleves", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
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
  const { user } = await requireModuleAccess("eleves", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const parent = await db.user.findFirst({
      where: { id: parentUserId, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
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

// ── Hard delete ────────────────────────────────────────────
// The core lives in src/lib/parent-hard-delete.ts (NOT in this "use server"
// file: an export here would be a public server action). The automatic purge
// of abandoned sign-ups shares it.

/**
 * Permanently delete one parent (trash view). Refuses while the parent still
 * has a linked child (would orphan the kid) or a non-draft dossier
 * (admissions owns it); draft dossiers are removed with the account.
 */
export async function permanentlyDeleteParent(
  parentUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireModuleAccess("eleves", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const r = await hardDeleteParentAccounts([parentUserId], tenantId, user, {
      pendingOnly: false,
    });
    revalidatePath("/admin/parents");
    if (r.processed === 1) return { ok: true };
    if (r.skippedHasChildren > 0) return { ok: false, error: "has-children" };
    if (r.skippedHasDossier > 0) return { ok: false, error: "has-dossier" };
    return { ok: false, error: "not-found" };
  });
}

// ── Bulk variants ──────────────────────────────────────────

async function withParentTenant<T>(
  ids: string[],
  fn: (tenantId: string, user: { role: string }) => Promise<T>,
): Promise<T | { ok: false; processed: 0; skipped: 0 }> {
  if (ids.length === 0) {
    return { ok: false, processed: 0, skipped: 0 } as unknown as T;
  }
  const { user } = await requireModuleAccess("eleves", "full");
  const tenantId = user.tenantId;
  if (!tenantId) {
    return { ok: false, processed: 0, skipped: 0 } as unknown as T;
  }
  return runWithTenant({ tenantId, slug: null }, () => fn(tenantId, user));
}

export async function bulkSetParentsArchived(
  ids: string[],
  archived: boolean,
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async (tenantId, user) => {
    const r = await db.user.updateMany({
      where: { id: { in: ids }, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
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
  return withParentTenant(ids, async (tenantId, user) => {
    const r = await db.user.updateMany({
      where: { id: { in: ids }, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/admin/parents");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<ParentBulkResult>;
}

export async function bulkRestoreParents(
  ids: string[],
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async (tenantId, user) => {
    const r = await db.user.updateMany({
      where: { id: { in: ids }, role: "PARENT", ...(await staffIdentityGuard(user, tenantId)) },
      data: { deletedAt: null, archived: false, archivedAt: null },
    });
    revalidatePath("/admin/parents");
    return { ok: true, processed: r.count, skipped: ids.length - r.count };
  }) as Promise<ParentBulkResult>;
}

/**
 * Bulk permanent delete (trash view): same rules as the single action, one
 * account at a time so a refused row never aborts the others. Skipped rows
 * are counted in the toast — admin can clean those up by hand.
 */
export async function bulkPermanentlyDeleteParents(
  ids: string[],
): Promise<ParentBulkResult> {
  return withParentTenant(ids, async (tenantId, user) => {
    const r = await hardDeleteParentAccounts(ids, tenantId, user, { pendingOnly: false });
    revalidatePath("/admin/parents");
    return { ok: true, processed: r.processed, skipped: ids.length - r.processed };
  }) as Promise<ParentBulkResult>;
}

// ── Pending accounts purge ─────────────────────────────────
//
// A PENDING account (see ./_pending.ts) is a self-registered or admin-created
// parent that the school has not confirmed: no Dars id, no child linked. Such
// an account is HARD deleted, not tombstoned — a soft delete would keep the
// e-mail reserved (@@unique([tenantId, email])) and block the real family
// from ever registering with it.

/**
 * Purge pending parent accounts (the "En attente" view). Same core as the
 * trash's permanent delete, with the PENDING predicate enforced server-side
 * whatever the UI sent. `skipped` = ids not deleted for any reason (not
 * pending, guarded, has dossier, FK error); `skippedHasDossier` is the part
 * of it that admissions must decide first.
 */
export async function purgePendingParents(
  ids: string[],
): Promise<ParentPurgeResult> {
  const nothing: ParentPurgeResult = {
    ok: false,
    processed: 0,
    skipped: 0,
    skippedHasDossier: 0,
  };
  if (ids.length === 0) return nothing;
  const { user } = await requireModuleAccess("eleves", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return nothing;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const r = await hardDeleteParentAccounts(ids, tenantId, user, { pendingOnly: true });
    revalidatePath("/admin/parents");
    return {
      ok: true,
      processed: r.processed,
      skipped: ids.length - r.processed,
      skippedHasDossier: r.skippedHasDossier,
    };
  });
}
