"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
    },
  });
}
