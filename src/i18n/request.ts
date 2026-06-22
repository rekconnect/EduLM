import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { auth } from "@/lib/auth";
import { unscopedDb } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "./config";

/**
 * Locale resolution order:
 *   1. `NEXT_LOCALE` cookie — an explicit choice from the locale switcher
 *      (honoured only if the language is enabled for the tenant).
 *   2. Tenant default — inside a school context, the school's configured
 *      `defaultLocale` wins. Schools want one consistent language for everyone,
 *      so we deliberately ignore the browser's `accept-language` here (an
 *      English-language browser must still see a French school in French).
 *      The tenant is resolved from the URL slug (subdomain / `/t/<slug>/`) OR,
 *      when there's no slug, from the logged-in user's tenant — so admin/app
 *      pages at the bare root still render in the school's language.
 *   3. `accept-language` — only on the root marketing domain with no school
 *      context and no signed-in user to defer to.
 *   4. Hard fallback to `fr`.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let enabled: readonly Locale[] = LOCALES;
  let tenantDefault: Locale = DEFAULT_LOCALE;
  let inTenantContext = false;

  // A DB hiccup (or a missing session) must never break rendering, so each
  // lookup falls back silently to "all locales / fr".
  const applyTenant = (tenant: {
    defaultLocale: string;
    enabledLocales: string[];
  }) => {
    inTenantContext = true;
    if (isLocale(tenant.defaultLocale)) tenantDefault = tenant.defaultLocale;
    const en = tenant.enabledLocales.filter(isLocale);
    if (en.length > 0) enabled = en;
  };

  const slug = (headerStore.get("x-tenant-slug") ?? "").trim();
  if (slug) {
    try {
      const tenant = await unscopedDb().tenant.findFirst({
        where: { slug },
        select: { defaultLocale: true, enabledLocales: true },
      });
      if (tenant) applyTenant(tenant);
    } catch {
      // keep defaults
    }
  } else {
    // No URL tenant context — defer to the signed-in user's tenant so admin
    // and in-app pages (which live at the bare root) follow the school's
    // language instead of the browser's.
    try {
      const session = await auth();
      const tenantId = session?.user?.tenantId ?? null;
      if (tenantId) {
        const tenant = await unscopedDb().tenant.findUnique({
          where: { id: tenantId },
          select: { defaultLocale: true, enabledLocales: true },
        });
        if (tenant) applyTenant(tenant);
      }
    } catch {
      // keep defaults
    }
  }

  let locale: Locale;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (isLocale(cookieLocale) && enabled.includes(cookieLocale)) {
    locale = cookieLocale;
  } else if (inTenantContext) {
    // School context → school default (clamped to an enabled language).
    locale = enabled.includes(tenantDefault) ? tenantDefault : (enabled[0] ?? DEFAULT_LOCALE);
  } else {
    // Root marketing domain → negotiate against the browser.
    const accept = headerStore.get("accept-language") ?? "";
    const top = accept.split(",")[0]?.split("-")[0]?.toLowerCase();
    locale = isLocale(top) ? top : DEFAULT_LOCALE;
  }

  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});
