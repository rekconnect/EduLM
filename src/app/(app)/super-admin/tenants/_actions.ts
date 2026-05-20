"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

const LOCALES = ["fr", "en", "ar"] as const;
const PLANS = ["TRIAL", "STARTER", "GROWTH", "CUSTOM"] as const;

const tenantSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, digits, and dashes."),
  name: z.string().trim().min(1).max(120),
  defaultLocale: z.enum(LOCALES),
  enabledLocales: z.array(z.enum(LOCALES)).min(1),
  plan: z.enum(PLANS),
  adminEmail: z.string().email().toLowerCase(),
  adminName: z.string().trim().min(1).max(120),
  adminPassword: z.string().min(8).max(128),
});

export type TenantFormState = {
  errors?: Partial<Record<keyof z.input<typeof tenantSchema>, string>>;
  formError?: string;
};

export async function createTenant(
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  await requireRole("SUPER_ADMIN");

  const enabledLocales = formData
    .getAll("enabledLocales")
    .map((v) => String(v))
    .filter((v) => (LOCALES as readonly string[]).includes(v));

  const parsed = tenantSchema.safeParse({
    slug: String(formData.get("slug") ?? "").toLowerCase(),
    name: String(formData.get("name") ?? ""),
    defaultLocale: String(formData.get("defaultLocale") ?? "fr"),
    enabledLocales,
    plan: String(formData.get("plan") ?? "TRIAL"),
    adminEmail: String(formData.get("adminEmail") ?? ""),
    adminName: String(formData.get("adminName") ?? ""),
    adminPassword: String(formData.get("adminPassword") ?? ""),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: TenantFormState["errors"] = {};
    for (const [k, v] of Object.entries(flat)) {
      if (v && v.length > 0) (errors as Record<string, string>)[k] = v[0]!;
    }
    return { errors };
  }

  const data = parsed.data;
  if (!data.enabledLocales.includes(data.defaultLocale)) {
    return { errors: { defaultLocale: "Default locale must be in enabled locales." } };
  }

  const db = unscopedDb();
      const slugTaken = await db.tenant.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (slugTaken) return { errors: { slug: "Already taken." } };

    const passwordHash = await bcrypt.hash(data.adminPassword, 10);

    await db.tenant.create({
      data: {
        slug: data.slug,
        name: data.name,
        defaultLocale: data.defaultLocale,
        enabledLocales: data.enabledLocales,
        plan: data.plan,
        users: {
          create: {
            email: data.adminEmail,
            name: data.adminName,
            passwordHash,
            role: "SCHOOL_ADMIN",
            status: "ACTIVE",
            locale: data.defaultLocale,
          },
        },
      },
    });
  revalidatePath("/super-admin");
  redirect("/super-admin");
}
