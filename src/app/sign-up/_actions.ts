"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { unscopedDb } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { createFamily } from "@/lib/family";

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

// ── New-family sign-up: Responsable 1 (required) + Responsable 2 (optional) ──
// Creates a shared Family + a Guardian per responsable so both can access the
// family's dossiers from day one. Only for families with NO prior student
// (the other two situations route to sign-in instead).

const respSchema = z.object({
  email: z.string().email().max(200),
  lastName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
  password2: z.string().min(1),
});

export type SignUpFamilyState = {
  errors?: Record<string, string>; // keys like "r1.email", "r2.password"
  formError?: string;
};

function readResp(fd: FormData, prefix: "r1" | "r2") {
  return {
    email: String(fd.get(`${prefix}.email`) ?? "").toLowerCase().trim(),
    lastName: String(fd.get(`${prefix}.lastName`) ?? ""),
    firstName: String(fd.get(`${prefix}.firstName`) ?? ""),
    password: String(fd.get(`${prefix}.password`) ?? ""),
    password2: String(fd.get(`${prefix}.password2`) ?? ""),
  };
}

export async function signUpFamily(
  _prev: SignUpFamilyState,
  formData: FormData,
): Promise<SignUpFamilyState> {
  const h = await headers();
  const slugFromHeader = h.get("x-tenant-slug");
  const slugFromForm = String(formData.get("tenantSlug") ?? "");
  const tenantSlug = (slugFromHeader || slugFromForm).toLowerCase().trim();
  if (!tenantSlug) return { formError: "Unknown tenant" };

  const r1raw = readResp(formData, "r1");
  const r2raw = readResp(formData, "r2");
  const r2HasAny = Object.values(r2raw).some((v) => v.trim().length > 0);

  const errors: Record<string, string> = {};
  const r1 = respSchema.safeParse(r1raw);
  if (!r1.success) {
    for (const i of r1.error.issues) errors[`r1.${String(i.path[0])}`] = i.message;
  } else if (r1raw.password !== r1raw.password2) {
    errors["r1.password2"] = "mismatch";
  }

  let r2: z.infer<typeof respSchema> | null = null;
  if (r2HasAny) {
    const p = respSchema.safeParse(r2raw);
    if (!p.success) {
      for (const i of p.error.issues) errors[`r2.${String(i.path[0])}`] = i.message;
    } else if (r2raw.password !== r2raw.password2) {
      errors["r2.password2"] = "mismatch";
    } else {
      r2 = p.data;
    }
    if (r1.success && r2 && r1.data.email === r2.email) {
      errors["r2.email"] = "same";
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  const r1d = r1.success ? r1.data : null;
  if (!r1d) return { errors };

  const db = unscopedDb();
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, defaultLocale: true },
  });
  if (!tenant) return { formError: "Unknown tenant" };

  // Email uniqueness within the tenant.
  const emails = [r1d.email, ...(r2 ? [r2.email] : [])];
  const taken = await db.user.findMany({
    where: { tenantId: tenant.id, email: { in: emails } },
    select: { email: true },
  });
  const takenSet = new Set(taken.map((u) => u.email));
  if (takenSet.has(r1d.email)) errors["r1.email"] = "exists";
  if (r2 && takenSet.has(r2.email)) errors["r2.email"] = "exists";
  if (Object.keys(errors).length > 0) return { errors };

  // Shared family, then a User + Guardian per responsable.
  const family = await createFamily(tenant.id, {
    name: `Famille ${r1d.lastName}`,
  });

  async function createResponsable(d: z.infer<typeof respSchema>) {
    const passwordHash = await bcrypt.hash(d.password, 10);
    const user = await db.user.create({
      data: {
        tenantId: tenant!.id,
        email: d.email,
        firstName: d.firstName,
        lastName: d.lastName,
        name: `${d.firstName} ${d.lastName}`.trim(),
        passwordHash,
        role: "PARENT",
        status: "ACTIVE",
        locale: tenant!.defaultLocale,
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    await db.guardian.create({
      data: { tenantId: tenant!.id, userId: user.id, familyId: family.id },
    });
  }

  await createResponsable(r1d);
  if (r2) await createResponsable(r2);

  await signIn("credentials", {
    email: r1d.email,
    password: r1d.password,
    tenantSlug,
    redirectTo: "/parent/applications",
  });
  redirect("/parent/applications");
}
