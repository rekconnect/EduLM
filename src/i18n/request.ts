import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
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
 *   3. `accept-language` — only on the root marketing domain, where there is
 *      no school context to defer to.
 *   4. Hard fallback to `fr`.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // Tenant context (slug set by the proxy from subdomain or /t/<slug>/ path).
  // Look up the school's default + enabled languages; a DB hiccup must never
  // break rendering, so fall back to "all locales / fr" on error.
  const slug = (headerStore.get("x-tenant-slug") ?? "").trim();
  let enabled: readonly Locale[] = LOCALES;
  let tenantDefault: Locale = DEFAULT_LOCALE;
  if (slug) {
    try {
      const tenant = await unscopedDb().tenant.findFirst({
        where: { slug },
        select: { defaultLocale: true, enabledLocales: true },
      });
      if (tenant) {
        if (isLocale(tenant.defaultLocale)) tenantDefault = tenant.defaultLocale;
        const en = tenant.enabledLocales.filter(isLocale);
        if (en.length > 0) enabled = en;
      }
    } catch {
      // keep defaults
    }
  }

  let locale: Locale;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (isLocale(cookieLocale) && enabled.includes(cookieLocale)) {
    locale = cookieLocale;
  } else if (slug) {
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
