import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { extractTenantSlugFromHost } from "@/lib/tenant-resolve";
import { SignUpFlow } from "./_flow";

export default async function SignUpPage() {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) notFound();

  // Tenant-correct links: bare paths on a real subdomain, /t/<slug>/ in dev.
  const onSubdomain = !!extractTenantSlugFromHost(h.get("host"));
  const signInHref = onSubdomain ? "/sign-in" : `/t/${slug}/sign-in`;
  const forgotHref = onSubdomain ? "/forgot-password" : `/t/${slug}/forgot-password`;

  const t = await getTranslations("admissions");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] px-6 py-16">
      <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-[0.75rem] bg-[color:var(--color-brand-500)] text-lg font-semibold text-[color:var(--color-foreground-onbrand)] shadow-card">
            E
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
            {t("signUpTitle")}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
            {t("signUpLead")}
          </p>
        </div>

        <div className="rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
          <SignUpFlow tenantSlug={slug} signInHref={signInHref} forgotHref={forgotHref} />
        </div>
      </div>
    </main>
  );
}
