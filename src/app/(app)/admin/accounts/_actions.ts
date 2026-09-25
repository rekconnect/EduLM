"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

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
      data: { passwordHash, status: "ACTIVE", mustChangePassword: true },
    });
    return { newPassword } satisfies AccountActionState;
  });
  revalidatePath("/admin/accounts");
  return state;
}
