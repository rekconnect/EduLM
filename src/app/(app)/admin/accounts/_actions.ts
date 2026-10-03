"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  PROVENANCE_SELECT,
  hasProvenance,
  moveAdminGrantEmail,
  staffDomainsFor,
} from "@/lib/staff-identity";

/** Roles this console may manage. SCHOOL_ADMIN rows are view-only — an admin
 *  must never be able to take over a peer admin from here (owner/script only). */
const MANAGED_ROLES = ["TEACHER", "STAFF", "PARENT"] as const;

function genTempPassword(): string {
  // 12-char alphanumeric, no ambiguous chars (no 0/O/1/l/I).
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

export type AccountActionState = {
  error?: string;
  newPassword?: string;
};

export async function toggleAccountStatus(userId: string): Promise<AccountActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  const state = await runWithTenant({ tenantId, slug: null }, async () => {
    const cur = await db.user.findFirst({
      where: { id: userId, role: { in: [...MANAGED_ROLES] } },
      select: { status: true },
    });
    if (!cur) return { error: "not-found" } satisfies AccountActionState;
    const next = cur.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    await db.user.update({ where: { id: userId }, data: { status: next } });
    return {} satisfies AccountActionState;
  });
  revalidatePath("/admin/accounts");
  return state;
}

/** Email + role editor. Email is User.email — the SAME column the parent
 *  fiche edits (userBoundTo) and the login identifier, so a change here is a
 *  change everywhere, instantly. Role moves are allowed among the three
 *  managed roles only (never from/to admin). */
export async function updateAccount(
  userId: string,
  input: { email?: string; role?: string },
): Promise<AccountActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  const email = input.email?.trim().toLowerCase();
  const role = input.role;
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "bad-email" };
  }
  if (role !== undefined && !(MANAGED_ROLES as readonly string[]).includes(role)) {
    return { error: "bad-role" };
  }
  const state = await runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.user.findFirst({
      where: { id: userId, role: { in: [...MANAGED_ROLES] } },
      select: { id: true, email: true, role: true, staffRole: true, ...PROVENANCE_SELECT },
    });
    if (!target) return { error: "not-found" } satisfies AccountActionState;
    // A double profil (parent + staff hat) must stay a PARENT: switching the
    // role would orphan the parent side. Remove the hat first (Permissions).
    if (role && target.staffRole && role !== "PARENT") {
      return { error: "has-hat" } satisfies AccountActionState;
    }
    // Turning a parent account into a staff account = the same trust decision
    // as a hat: only for an account that is provably the person's own.
    if (role && target.role === "PARENT" && role !== "PARENT") {
      if (!(await staffDomainsFor(tenantId)).length || !hasProvenance(target)) {
        return { error: "parent-unverified" } satisfies AccountActionState;
      }
    }
    if (email && email !== target.email) {
      const clash = await db.user.findFirst({ where: { email }, select: { id: true } });
      if (clash) return { error: "email-taken" } satisfies AccountActionState;
    }
    await db.user.update({
      where: { id: userId },
      data: {
        ...(email ? { email } : {}),
        // The JWT carries the role: a re-roled account must sign in again.
        ...(role && role !== target.role
          ? { role: role as "TEACHER" | "STAFF" | "PARENT", sessionsInvalidBefore: new Date() }
          : {}),
      },
    });
    // Module grants are keyed by e-mail — keep them with the account.
    if (email && email !== target.email) await moveAdminGrantEmail(tenantId, target.email, email);
    return {} satisfies AccountActionState;
  });
  revalidatePath("/admin/accounts");
  return state;
}

/** Admin sets a chosen password by hand (vs the generated temp): no forced
 *  change at first sign-in — the admin picked it deliberately. */
export async function setAccountPassword(
  userId: string,
  password: string,
): Promise<AccountActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  if (typeof password !== "string" || password.length < 8) {
    return { error: "password-too-short" };
  }
  const state = await runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.user.findFirst({
      where: { id: userId, role: { in: [...MANAGED_ROLES] } },
      select: { id: true },
    });
    if (!target) return { error: "not-found" } satisfies AccountActionState;
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: userId },
      data: { passwordHash, status: "ACTIVE", mustChangePassword: false, sessionsInvalidBefore: new Date() },
    });
    return {} satisfies AccountActionState;
  });
  revalidatePath("/admin/accounts");
  return state;
}

export async function resetAccountPassword(userId: string): Promise<AccountActionState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "no-tenant" };
  const newPassword = genTempPassword();
  const state = await runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.user.findFirst({
      where: { id: userId, role: { in: [...MANAGED_ROLES] } },
      select: { id: true },
    });
    if (!target) return { error: "not-found" } satisfies AccountActionState;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: userId },
      // mustChangePassword: the temp password only opens the door once — the
      // account holder must pick their own on first sign-in.
      data: { passwordHash, status: "ACTIVE", mustChangePassword: true, sessionsInvalidBefore: new Date() },
    });
    return { newPassword } satisfies AccountActionState;
  });
  revalidatePath("/admin/accounts");
  return state;
}
