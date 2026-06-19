"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { unscopedDb } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/session";
import { LOCALES, type Locale } from "@/i18n/config";

export type SettingsResult =
  | { ok: true }
  | { ok: false; error: string };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ─── General ──────────────────────────────────────────────────

const generalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  defaultLocale: z.enum(LOCALES as readonly [Locale, ...Locale[]]),
  enabledLocales: z.array(z.enum(LOCALES as readonly [Locale, ...Locale[]])).min(1),
  timeZone: z.string().trim().min(1).max(64),
});

export async function updateGeneralSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const enabledLocales = formData.getAll("enabledLocales").map(String);
  const parsed = generalSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    defaultLocale: String(formData.get("defaultLocale") ?? ""),
    enabledLocales,
    timeZone: String(formData.get("timeZone") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "validation" };

  if (!parsed.data.enabledLocales.includes(parsed.data.defaultLocale)) {
    return { ok: false, error: "default-not-enabled" };
  }

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      name: parsed.data.name,
      defaultLocale: parsed.data.defaultLocale,
      enabledLocales: parsed.data.enabledLocales,
      timeZone: parsed.data.timeZone,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Identity / Branding ──────────────────────────────────────

const brandingSchema = z.object({
  brandLight: z.string().trim().regex(HEX_RE).optional().or(z.literal("")),
  brandDark: z.string().trim().regex(HEX_RE).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export async function updateBranding(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const parsed = brandingSchema.safeParse({
    brandLight: String(formData.get("brandLight") ?? ""),
    brandDark: String(formData.get("brandDark") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "validation" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      brandLight: parsed.data.brandLight || null,
      brandDark: parsed.data.brandDark || null,
      logoUrl: parsed.data.logoUrl || null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetBranding(): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: { brandLight: null, brandDark: null, logoUrl: null },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Contact info ─────────────────────────────────────────────

const contactSchema = z.object({
  address: z.string().trim().max(500).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .or(z.literal("")),
  websiteUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .or(z.literal("")),
});

export async function updateContactInfo(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const parsed = contactSchema.safeParse({
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "validation" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      contactEmail: parsed.data.contactEmail || null,
      websiteUrl: parsed.data.websiteUrl || null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Billing defaults ─────────────────────────────────────────

const billingSchema = z.object({
  defaultCurrency: z.string().trim().length(3),
  defaultInvoiceDueOffsetDays: z.coerce.number().int().min(0).max(365),
  invoiceFooterText: z.string().trim().max(2000).optional().or(z.literal("")),
  invoiceNumberPrefix: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal("")),
  invoiceNumberPadding: z.coerce.number().int().min(0).max(10),
});

export async function updateBillingDefaults(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const parsed = billingSchema.safeParse({
    defaultCurrency: String(formData.get("defaultCurrency") ?? "").toUpperCase(),
    defaultInvoiceDueOffsetDays: formData.get("defaultInvoiceDueOffsetDays"),
    invoiceFooterText: String(formData.get("invoiceFooterText") ?? ""),
    invoiceNumberPrefix: String(formData.get("invoiceNumberPrefix") ?? ""),
    invoiceNumberPadding: formData.get("invoiceNumberPadding"),
  });
  if (!parsed.success) return { ok: false, error: "validation" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      defaultCurrency: parsed.data.defaultCurrency,
      defaultInvoiceDueOffsetDays: parsed.data.defaultInvoiceDueOffsetDays,
      invoiceFooterText: parsed.data.invoiceFooterText || null,
      invoiceNumberPrefix: parsed.data.invoiceNumberPrefix || null,
      invoiceNumberPadding: parsed.data.invoiceNumberPadding,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Email defaults ───────────────────────────────────────────

const emailSchema = z.object({
  emailSenderName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("")),
  emailSignature: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("")),
});

export async function updateEmailDefaults(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const parsed = emailSchema.safeParse({
    emailSenderName: String(formData.get("emailSenderName") ?? ""),
    emailSignature: String(formData.get("emailSignature") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "validation" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      emailSenderName: parsed.data.emailSenderName || null,
      emailSignature: parsed.data.emailSignature || null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Loader ───────────────────────────────────────────────────

export async function loadTenantSettings() {
  const user = await requireUser();
  if (!user.tenantId) return null;
  return unscopedDb().tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      defaultLocale: true,
      enabledLocales: true,
      timeZone: true,
      brandLight: true,
      brandDark: true,
      logoUrl: true,
      address: true,
      phone: true,
      contactEmail: true,
      websiteUrl: true,
      defaultCurrency: true,
      defaultInvoiceDueOffsetDays: true,
      invoiceFooterText: true,
      invoiceNumberPrefix: true,
      invoiceNumberPadding: true,
      emailSenderName: true,
      emailSignature: true,
      familyCodePrefix: true,
      familyCodePadding: true,
      familyCodeNextSequence: true,
    },
  });
}

// ─── Family code format (Round 4) ──────────────────────────────

const familyCodeSchema = z.object({
  familyCodePrefix: z.string().trim().max(16).optional(),
  familyCodePadding: z.coerce.number().int().min(0).max(8),
});

export async function updateFamilyCodeSettings(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const parsed = familyCodeSchema.safeParse({
    familyCodePrefix: String(formData.get("familyCodePrefix") ?? "").trim() || undefined,
    familyCodePadding: formData.get("familyCodePadding") ?? 4,
  });
  if (!parsed.success) return { ok: false, error: "validation" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      familyCodePrefix: parsed.data.familyCodePrefix ?? null,
      familyCodePadding: parsed.data.familyCodePadding,
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

// ─── Parent / Student field configs (Round 5) ─────────────────

import {
  DOSSIER_BOUND_PROPS,
  ENTITY_TYPES,
  FAMILY_BOUND_PROPS,
  FIELD_TYPES,
  GUARDIAN_BOUND_PROPS,
  USER_BOUND_PROPS,
  parseEntityFieldsConfig,
  type EntityType,
} from "@/lib/entity-fields";

const fieldSchema = z.object({
  id: z.string().trim().min(1).max(80),
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  hint: z.string().trim().max(300).optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  categoryId: z.string().trim().min(1).max(80),
  order: z.coerce.number().int().min(0).max(1000),
  showIf: z
    .object({
      fieldId: z.string().trim().min(1).max(80),
      equals: z.string().trim().max(200).optional(),
      equalsAny: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
      anyValue: z.boolean().optional(),
    })
    .refine(
      (s) =>
        s.anyValue === true ||
        typeof s.equals === "string" ||
        (Array.isArray(s.equalsAny) && s.equalsAny.length > 0),
      "showIf needs anyValue, equals, or equalsAny",
    )
    .optional(),
  hideIf: z
    .object({
      fieldId: z.string().trim().min(1).max(80),
      equals: z.string().trim().max(200).optional(),
      equalsAny: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
      anyValue: z.boolean().optional(),
    })
    .refine(
      (s) =>
        s.anyValue === true ||
        typeof s.equals === "string" ||
        (Array.isArray(s.equalsAny) && s.equalsAny.length > 0),
      "hideIf needs anyValue, equals, or equalsAny",
    )
    .optional(),
  optionsSource: z
    .object({
      fieldId: z.string().trim().min(1).max(80),
    })
    .optional(),
  userBoundTo: z.enum(USER_BOUND_PROPS).optional(),
  dossierBoundTo: z.enum(DOSSIER_BOUND_PROPS).optional(),
  guardianBoundTo: z.enum(GUARDIAN_BOUND_PROPS).optional(),
  familyBoundTo: z.enum(FAMILY_BOUND_PROPS).optional(),
  // Hide from the inscription form, keep on the fiche.
  formHidden: z.boolean().optional(),
  active: z.boolean().optional(),
});

const categorySchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  order: z.coerce.number().int().min(0).max(1000),
  active: z.boolean(),
});

const fieldsConfigSchema = z.object({
  entity: z.enum(ENTITY_TYPES),
  categories: z.array(categorySchema).max(40),
  fields: z.array(fieldSchema).max(200),
});

export async function loadEntityFieldsConfig(entity: EntityType) {
  const user = await requireUser();
  if (!user.tenantId) return { categories: [], fields: [] };
  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      parentFieldsConfig: entity === "parent",
      studentFieldsConfig: entity === "student",
    },
  });
  const raw =
    entity === "parent" ? tenant?.parentFieldsConfig : tenant?.studentFieldsConfig;
  return parseEntityFieldsConfig(raw);
}

// ─── Parent-create form config (built-in toggles + custom fields) ──

const BUILTIN_MODES_ENUM = ["required", "optional", "hidden"] as const;
const parentCreateConfigSchema = z.object({
  builtin: z.object({
    firstName: z.enum(BUILTIN_MODES_ENUM),
    lastName: z.enum(BUILTIN_MODES_ENUM),
    relation: z.enum(BUILTIN_MODES_ENUM),
    locale: z.enum(BUILTIN_MODES_ENUM),
  }),
  categories: z.array(categorySchema).max(40),
  fields: z.array(fieldSchema).max(200),
});

export async function loadParentCreateConfig() {
  const user = await requireUser();
  if (!user.tenantId) {
    const { DEFAULT_PARENT_CREATE_CONFIG } = await import(
      "@/lib/parent-create-config"
    );
    return DEFAULT_PARENT_CREATE_CONFIG;
  }
  const { parseParentCreateConfig } = await import(
    "@/lib/parent-create-config"
  );
  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: user.tenantId },
    select: { parentCreateFieldsConfig: true },
  });
  return parseParentCreateConfig(tenant?.parentCreateFieldsConfig);
}

export async function updateParentCreateConfig(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const raw = String(formData.get("config") ?? "{}");
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  const parsed = parentCreateConfigSchema.safeParse(parsedRaw);
  if (!parsed.success) return { ok: false, error: "validation" };

  // Same cross-validation as entity fields: drop orphaned fields, strip
  // options for non-select types.
  const categoryIds = new Set(parsed.data.categories.map((c) => c.id));
  const cleanedFields = parsed.data.fields.filter((f) =>
    categoryIds.has(f.categoryId),
  );
  const finalFields = cleanedFields.map((f) =>
    f.type === "select" ? f : { ...f, options: undefined },
  );

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data: {
      parentCreateFieldsConfig: {
        builtin: parsed.data.builtin,
        categories: parsed.data.categories,
        fields: finalFields,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/admin/parents/new");
  return { ok: true };
}

export async function updateEntityFieldsConfig(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const raw = String(formData.get("config") ?? "{}");
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  const parsed = fieldsConfigSchema.safeParse(parsedRaw);
  if (!parsed.success) return { ok: false, error: "validation" };

  // Cross-validate categoryId references: every field must point at one of
  // the categories in this payload. Drop any orphaned fields silently — the
  // UI shouldn't produce them, but better to defend.
  const categoryIds = new Set(parsed.data.categories.map((c) => c.id));
  const cleanedFields = parsed.data.fields.filter((f) =>
    categoryIds.has(f.categoryId),
  );

  // For non-select types, strip options to keep the JSON tidy.
  const finalFields = cleanedFields.map((f) =>
    f.type === "select" ? f : { ...f, options: undefined },
  );

  const next = {
    categories: parsed.data.categories,
    fields: finalFields,
  };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    data:
      parsed.data.entity === "parent"
        ? { parentFieldsConfig: next as unknown as Prisma.InputJsonValue }
        : { studentFieldsConfig: next as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/settings");
  return { ok: true };
}

// ─── Establishments (Round 4) ──────────────────────────────────

const establishmentSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1).max(80),
  levels: z.array(z.string().trim().min(1).max(40)).max(40),
  order: z.coerce.number().int().min(0).max(100),
  isActive: z.boolean(),
});

export async function listEstablishments() {
  const user = await requireUser();
  if (!user.tenantId) return [];
  return unscopedDb().establishment.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      levels: true,
      order: true,
      isActive: true,
    },
  });
}

export async function saveEstablishments(
  formData: FormData,
): Promise<SettingsResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const raw = String(formData.get("establishments") ?? "[]");
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (!Array.isArray(parsedRaw)) return { ok: false, error: "invalid-shape" };

  const valid: Array<z.infer<typeof establishmentSchema>> = [];
  for (const e of parsedRaw) {
    const parsed = establishmentSchema.safeParse(e);
    if (parsed.success) valid.push(parsed.data);
  }

  // Replace-style sync: delete establishments not present in payload, upsert
  // the rest. Tenant scoping via explicit where: { tenantId }.
  const tenantId = user.tenantId;
  const incomingIds = valid.filter((e) => e.id).map((e) => e.id!) as string[];

  const u = unscopedDb();
  await u.$transaction(async (tx) => {
    if (incomingIds.length > 0) {
      await tx.establishment.deleteMany({
        where: { tenantId, NOT: { id: { in: incomingIds } } },
      });
    } else {
      await tx.establishment.deleteMany({ where: { tenantId } });
    }
    for (const e of valid) {
      if (e.id) {
        await tx.establishment.update({
          where: { id: e.id },
          data: {
            name: e.name,
            levels: e.levels,
            order: e.order,
            isActive: e.isActive,
          },
        });
      } else {
        await tx.establishment.create({
          data: {
            tenantId,
            name: e.name,
            levels: e.levels,
            order: e.order,
            isActive: e.isActive,
          },
        });
      }
    }
  });

  revalidatePath("/settings");
  return { ok: true };
}
