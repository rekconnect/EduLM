"use server";

import { revalidatePath } from "next/cache";
import { db, unscopedDb } from "@/lib/db";
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
    const existing = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { role: true },
    });
    if (existing?.role === "PARENT") return { error: "parent-email" };
    if (existing?.role === "SCHOOL_ADMIN" || existing?.role === "SUPER_ADMIN") {
      return { error: "admin-email" };
    }

    if (Object.keys(modules).length === 0) {
      await unscopedDb().adminGrant.deleteMany({
        where: { tenantId, email },
      });
    } else {
      // Microsoft sign-in never self-provisions (unknown address → NoAccount
      // error), so an e-mail with no account yet gets a STAFF user created
      // here — SSO-only (no password), same pattern as payroll's
      // linkStaffUser. The person can sign in with Microsoft immediately.
      if (!existing) {
        await db.user.create({
          data: {
            tenantId,
            email,
            role: "STAFF",
            status: "ACTIVE",
            locale: "fr",
          },
        });
      }
      await unscopedDb().adminGrant.upsert({
        where: { tenantId_email: { tenantId, email } },
        create: {
          tenantId,
          email,
          modules,
          grantedByUserId: user.id,
        },
        update: { modules, grantedByUserId: user.id },
      });
    }
    revalidatePath("/admin/permissions");
    return { ok: true };
  });
}

export async function deleteAdminGrant(id: string): Promise<GrantActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  await unscopedDb().adminGrant.deleteMany({ where: { id, tenantId } });
  revalidatePath("/admin/permissions");
  return { ok: true };
}
