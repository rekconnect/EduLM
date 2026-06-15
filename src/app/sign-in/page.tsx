import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/lib/auth";
import { unscopedDb } from "@/lib/db";
import { extractTenantSlugFromHost } from "@/lib/tenant-resolve";
import { postSignInPath } from "@/lib/post-signin-redirect";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SignInSubmit } from "./_submit-button";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect(postSignInPath(session.user.role));
  }

  const { tenant, error } = await searchParams;
  const t = await getTranslations("signIn");
  const tCommon = await getTranslations("common");
  const tApp = await getTranslations("app");

  // Tenant-aware sign-up link + the open admission cycle's year for the
  // "first-time parent" CTA. Slug comes from the subdomain (prod) or the
  // /t/<slug>/ path (dev) — both surfaced as the x-tenant-slug header.
  const h = await headers();
  // Slug from the subdomain (prod) or /t/<slug>/ path (dev), both surfaced as
  // x-tenant-slug; fall back to the ?tenant= query. Empty = root marketing
  // domain → no school context, so the sign-up CTA is hidden (you can't enrol
  // without choosing a school).
  const slug = (h.get("x-tenant-slug") ?? "").trim() || (tenant ?? "").trim();
  const onSubdomain = !!extractTenantSlugFromHost(h.get("host"));
  const signUpHref = onSubdomain ? "/sign-up" : `/t/${slug}/sign-up`;
  const openCycle = slug
    ? await unscopedDb().admissionCycle.findFirst({
        where: {
          tenant: { slug },
          isActive: true,
          OR: [{ closeAt: null }, { closeAt: { gte: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        select: { targetYearLabel: true },
      })
    : null;
  const cycleYear = openCycle?.targetYearLabel ?? "";

  async function authenticate(formData: FormData) {
    "use server";
    const slug = formData.get("tenantSlug");
    const credentials: Record<string, string> = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };
    if (typeof slug === "string" && slug.length > 0) {
      credentials.tenantSlug = slug;
    }
    try {
      await signIn("credentials", { ...credentials, redirectTo: "/post-signin" });
    } catch (err) {
      // Auth.js v5 throws AuthError (CredentialsSignin) on a bad
      // email/password. Catch it and re-render sign-in with a friendly
      // message instead of letting it bubble up as a crash page. A
      // successful sign-in throws NEXT_REDIRECT (not an AuthError) — that
      // must be re-thrown so Next performs the redirect.
      if (err instanceof AuthError) {
        const qs = new URLSearchParams({ error: "CredentialsSignin" });
        if (typeof slug === "string" && slug.length > 0) qs.set("tenant", slug);
        redirect(`/sign-in?${qs.toString()}`);
      }
      throw err;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] px-6 py-16">
      <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-[0.75rem] bg-[color:var(--color-brand-500)] text-lg font-semibold text-[color:var(--color-foreground-onbrand)] shadow-card">
            E
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
            {t("subtitle", { tenantName: tenant ?? tApp("name") })}
          </p>
        </div>

        <div className="rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
          <form action={authenticate} className="space-y-4">
            {tenant ? <input type="hidden" name="tenantSlug" value={tenant} /> : null}

            <Field label={t("email")} htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
              />
            </Field>

            <Field label={t("password")} htmlFor="password" required>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                minLength={8}
              />
            </Field>

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger-soft-fg)]"
              >
                {t("errorInvalid")}
              </div>
            ) : null}

            <SignInSubmit label={t("submit")} pendingLabel={tCommon("loading")} />
          </form>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
          >
            {t("forgot")}
          </Link>
        </p>

        {/* First-time parent → inscription CTA. Only with a school context —
            at the root marketing domain there's no tenant to enrol into. */}
        {slug ? (
        <div className="mt-6 rounded-[0.75rem] border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-brand-700)]">
            {cycleYear ? t("noAccountTitle", { year: cycleYear }) : t("noAccountTitleGeneric")}
          </p>
          <p className="mt-1.5 text-sm text-[color:var(--color-foreground-muted)]">
            {t("noAccountLead")}
          </p>
          <Link
            href={signUpHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 py-2 text-sm font-semibold text-[color:var(--color-foreground-onbrand)] shadow-card transition-all duration-200 ease-out hover:bg-[color:var(--color-brand-700)] active:scale-[0.98]"
          >
            {t("createAccount")}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        ) : null}
      </div>
    </main>
  );
}
