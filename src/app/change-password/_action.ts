"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ACCOUNT_DISABLED_PATH, liveAccount, requireUser } from "@/lib/session";
import { unscopedDb } from "@/lib/db";
import { postSignInPath } from "@/lib/post-signin-redirect";

const schema = z.object({
  current: z.string().max(128).optional(),
  password: z.string().min(8).max(128),
  confirm: z.string().min(1),
});

export type ChangePwState = { error?: string };

/**
 * Set a new password for the currently-authenticated user and clear the
 * mustChangePassword flag. Used by the forced first-login change flow
 * (bulk-onboarded parents) and any voluntary change. Rejects a new
 * password identical to the current one so the shared default can't be
 * "re-confirmed".
 */
export async function changePassword(
  _prev: ChangePwState,
  formData: FormData,
): Promise<ChangePwState> {
  const sessionUser = await requireUser();
  // A revoked / disabled token must not be able to set a new password.
  if (!(await liveAccount(sessionUser))) redirect(ACCOUNT_DISABLED_PATH);
  const session = { user: sessionUser };

  const parsed = schema.safeParse({
    current: String(formData.get("current") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { error: "tooShort" };
  if (parsed.data.password !== parsed.data.confirm) return { error: "mismatch" };

  const db = unscopedDb();
  const current = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      passwordHash: true,
      role: true,
      mustChangePassword: true,
    },
  });
  if (!current) redirect("/sign-in");

  if (current.passwordHash) {
    // Proof of possession: a hijacked or shared session can't silently swap
    // the password. (The forced first-login change knows the initial one.)
    const ok =
      !!parsed.data.current &&
      (await bcrypt.compare(parsed.data.current, current.passwordHash));
    if (!ok) return { error: "currentWrong" };
    // Don't let them re-use the initial / current password.
    if (await bcrypt.compare(parsed.data.password, current.passwordHash)) {
      return { error: "sameAsOld" };
    }
  } else if (!current.mustChangePassword) {
    // No password on this account and no pending admin reset: a password
    // can't be added from a mere session (no proof of possession) — the
    // directory is the credential; an admin reset or the e-mailed reset code
    // is the way back.
    return { error: "ssoOnly" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  // Bust the cached (app) layout render — otherwise the router serves the
  // stale "redirect to /change-password" response it cached while the
  // flag was still true, and the user is prompted to change a 2nd time.
  revalidatePath("/", "layout");

  redirect(postSignInPath(current.role));
}
