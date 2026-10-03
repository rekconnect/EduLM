"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db, unscopedDb } from "@/lib/db";
import {
  PROVENANCE_SELECT,
  hasProvenance,
  isStaffDomainEmail,
  microsoftSsoConfigured,
  staffDomainsFor,
} from "@/lib/staff-identity";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  parseModuleGrants,
  type ModuleGrants,
} from "@/lib/permissions";

export type GrantActionState = {
  error?: string;
  ok?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create or update a grant (upsert by tenant + email). Only SCHOOL_ADMIN
 * (the tenant owner — Raed / administrator@) manages grants. An empty
 * module map deletes the grant: no row = no access.
 *
 * Guards: never grant to a PARENT account's e-mail (parents must not gain
 * admin surface), never to a SCHOOL_ADMIN (they already have everything —
 * a row would only mislead).
 */
export async function saveAdminGrant(input: {
  email: string;
  modules: Record<string, string>;
}): Promise<GrantActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "bad-email" };

  const modules: ModuleGrants = parseModuleGrants(input.modules);

  return runWithTenant({ tenantId, slug: null }, async () => {
    // No deletedAt filter: a tombstoned account still holds the address, and
    // creating a second one would violate the (tenantId, email) unique key.
    const existing = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true, role: true, staffRole: true, status: true, deletedAt: true,
        mustChangePassword: true, ...PROVENANCE_SELECT,
      },
    });

    // Revoking (empty module map) always works, whatever the account state.
    if (Object.keys(modules).length === 0) {
      await unscopedDb().adminGrant.deleteMany({ where: { tenantId, email } });
      await dropAdminHat(tenantId, email);
      revalidatePath("/admin/permissions");
      return { ok: true };
    }

    if (existing?.role === "SCHOOL_ADMIN" || existing?.role === "SUPER_ADMIN") {
      return { error: "admin-email" };
    }
    if (existing?.deletedAt) return { error: "account-deleted" };
    if (existing?.status === "DISABLED") return { error: "account-disabled" };

    // Double profil: a PARENT who is also personnel gets an Administrator hat
    // (teachers get theirs from the staff import) so the grant applies; the
    // account stays a parent everywhere. ONLY for an account that is provably
    // this person's (see hasProvenance) — /sign-up is public, so a staff
    // address could otherwise be squatted as a "parent" and handed access.
    const domains = await staffDomainsFor(tenantId);
    let hatData: Prisma.UserUpdateInput | null = null;
    if (existing?.role === "PARENT" && !existing.staffRole) {
      if (!domains.length) return { error: "staff-domains-unset" };
      if (!hasProvenance(existing)) return { error: "parent-unverified" };
      // A staff identity on a directory address is Microsoft-only: drop ANY
      // password (bulk-onboarded parents shared one initial password, so a
      // "self-chosen" one may have been set by whoever knew it) and revoke
      // every session minted with it. Only when the address is a directory
      // identity and Microsoft sign-in is configured — otherwise the person
      // would be locked out (a personal-address parent keeps their password).
      const stripShared =
        existing.passwordHash !== null &&
        microsoftSsoConfigured() &&
        isStaffDomainEmail(email, domains);
      hatData = {
        staffRole: "STAFF",
        ...(stripShared
          ? { passwordHash: null, mustChangePassword: false, sessionsInvalidBefore: new Date() }
          : {}),
      };
    }
    // A brand-new STAFF login is only ever minted on the school's own
    // staff e-mail domain(s) — any other address could be anyone's mailbox.
    if (!existing && !isStaffDomainEmail(email, domains)) {
      return { error: "staff-domain-required" };
    }

    // Hat + grant together: never a hat without its grant (or vice versa).
    await unscopedDb().$transaction(async (tx) => {
      if (!existing) {
        // Microsoft sign-in never self-provisions (unknown address → NoAccount
        // error), so an e-mail with no account yet gets a STAFF user created
        // here — SSO-only (no password), same pattern as payroll's
        // linkStaffUser. The person can sign in with Microsoft immediately.
        await tx.user.create({
          data: { tenantId, email, role: "STAFF", status: "ACTIVE", locale: "fr" },
        });
      } else if (hatData) {
        await tx.user.update({ where: { id: existing.id, tenantId }, data: hatData });
      }
      await tx.adminGrant.upsert({
        where: { tenantId_email: { tenantId, email } },
        create: { tenantId, email, modules, grantedByUserId: user.id },
        update: { modules, grantedByUserId: user.id },
      });
    });
    revalidatePath("/admin/permissions");
    return { ok: true };
  });
}

export async function deleteAdminGrant(id: string): Promise<GrantActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  if (typeof id !== "string" || !id) return { error: "invalid" };
  const grant = await unscopedDb().adminGrant.findFirst({ where: { id, tenantId }, select: { email: true } });
  if (!grant) return { error: "not-found" };
  await unscopedDb().adminGrant.deleteMany({ where: { id, tenantId } });
  await dropAdminHat(tenantId, grant.email);
  revalidatePath("/admin/permissions");
  return { ok: true };
}

/**
 * Revoking every module also removes an Administrator (STAFF) hat from a
 * parent account — that hat only exists to carry grants. A TEACHER hat comes
 * from the staff list and is kept (it carries the teachers' baseline access).
 */
async function dropAdminHat(tenantId: string, email: string): Promise<void> {
  // Console-made hats have no title; hats from the staff list carry the
  // person's Fonction and belong to the list, not to the grant.
  await unscopedDb().user.updateMany({
    where: {
      tenantId,
      email: { equals: email, mode: "insensitive" },
      role: "PARENT",
      staffRole: "STAFF",
      staffTitle: null,
    },
    data: { staffRole: null },
  });
}
