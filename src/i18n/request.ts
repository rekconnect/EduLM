import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/**
 * Locale resolution order:
 *   1. `NEXT_LOCALE` cookie set by the user via the locale switcher
 *   2. `accept-language` header (negotiated against the tenant's enabled locales)
 *   3. Tenant default (resolved later by the layout that has access to the tenant)
 *   4. Hard fallback to `fr`
 *
 * The tenant-aware narrowing happens in the [tenant] layout because that's
 * where we have the tenant's `enabledLocales` available.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let locale: Locale = DEFAULT_LOCALE;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const accept = headerStore.get("accept-language") ?? "";
    const top = accept.split(",")[0]?.split("-")[0]?.toLowerCase();
    if (isLocale(top)) locale = top;
  }

  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});
