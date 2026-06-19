import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { extractTenantSlugFromHost } from "@/lib/tenant-resolve";

export default async function HomePage() {
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");

  // Tenant context: subdomain (prod) or /t/<slug>/ path (dev), both surfaced
  // by the proxy as x-tenant-slug. Sign-up only makes sense with a school to
  // enrol into, so the CTA is hidden on the root marketing domain. In dev the
  // tenant lives in the path, so links must keep the /t/<slug> prefix; on a
  // subdomain the bare path already stays on the tenant host.
  const h = await headers();
  const slug = (h.get("x-tenant-slug") ?? "").trim();
  const onSubdomain = !!extractTenantSlugFromHost(h.get("host"));
  const withTenant = (p: string) => (slug && !onSubdomain ? `/t/${slug}${p}` : p);
  const signInHref = withTenant("/sign-in");
  const signUpHref = withTenant("/sign-up");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-5xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-3 text-sm uppercase tracking-widest text-[color:var(--muted-fg)]">
          {tApp("tagline")}
        </p>
        <p className="mt-8 text-lg leading-relaxed text-[color:var(--muted-fg)]">
          {t("lead")}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={signInHref}
            className="inline-flex items-center rounded-md bg-[color:var(--primary)] px-5 py-2.5 text-sm font-medium text-[color:var(--primary-foreground)] transition duration-200 ease-out hover:opacity-90 active:scale-[0.98]"
          >
            {t("ctaSignIn")}
          </Link>
          {slug ? (
            <Link
              href={signUpHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium transition duration-200 ease-out hover:bg-[color:var(--muted)] active:scale-[0.98]"
            >
              {t("ctaSignUp")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          ) : (
            <Link
              href="#features"
              className="inline-flex items-center rounded-md border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium transition duration-200 ease-out hover:bg-[color:var(--muted)]"
            >
              {t("ctaLearn")}
            </Link>
          )}
        </div>
        {slug ? (
          <p className="mt-5 text-sm text-[color:var(--muted-fg)]">{t("signUpHint")}</p>
        ) : null}
      </div>
    </main>
  );
}
