"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { unscopedDb } from "@/lib/db";
import { postSignInPath } from "@/lib/post-signin-redirect";

const schema = z.object({
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
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const parsed = schema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { error: "tooShort" };
  if (parsed.data.password !== parsed.data.confirm) return { error: "mismatch" };

  const db = unscopedDb();
  const current = await db.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, role: true },
  });
  if (!current) redirect("/sign-in");

  // Don't let them re-use the initial / current password.
  if (
    current.passwordHash &&
    (await bcrypt.compare(parsed.data.password, current.passwordHash))
  ) {
    return { error: "sameAsOld" };
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
