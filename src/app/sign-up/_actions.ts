"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { unscopedDb } from "@/lib/db";
import { signIn } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().min(3).max(200),
  password: z.string().min(8).max(128),
  tenantSlug: z.string().min(1),
});

export type SignUpFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

export async function signUpParent(
  _prev: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  // Tenant slug must come from the request (middleware-set header) so a
  // signed-up parent always belongs to the tenant whose subdomain they used.
  // Fall back to a hidden form field for path-based dev.
  const h = await headers();
  const slugFromHeader = h.get("x-tenant-slug");
  const slugFromForm = String(formData.get("tenantSlug") ?? "");
  const tenantSlug = (slugFromHeader || slugFromForm).toLowerCase().trim();

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    tenantSlug,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  const db = unscopedDb();
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: parsed.data.tenantSlug },
      select: { id: true, defaultLocale: true },
    });
    if (!tenant) return { formError: "Unknown tenant" };

    const existing = await db.user.findFirst({
      where: { email: parsed.data.email, tenantId: tenant.id },
      select: { id: true },
    });
    if (existing) {
      return { errors: { email: "exists" } };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await db.user.create({
      data: {
        tenantId: tenant.id,
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: "PARENT",
        status: "ACTIVE", // TODO: switch to INVITED + email verify once Resend is wired
        locale: tenant.defaultLocale,
        emailVerified: new Date(),
      },
    });
  } finally {
    await db.$disconnect();
  }

  // Sign the new parent in straight away.
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    tenantSlug: parsed.data.tenantSlug,
    redirectTo: "/parent/applications",
  });

  // Unreachable; signIn throws redirect.
  redirect("/parent/applications");
}
