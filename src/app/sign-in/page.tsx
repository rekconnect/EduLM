import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { auth, signIn, microsoftSignInEnabled } from "@/lib/auth";
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

  // Slug from the subdomain (prod) or /t/<slug>/ path (dev), both surfaced as
  // x-tenant-slug; fall back to the ?tenant= query. Empty = root marketing
  // domain → generic styling, no school context, no sign-up CTA.
  const h = await headers();
  const slug = (h.get("x-tenant-slug") ?? "").trim() || (tenant ?? "").trim();
  const onSubdomain = !!extractTenantSlugFromHost(h.get("host"));
  // Keep the tenant in the URL when it lives in the path (dev). On a subdomain
  // the tenant rides the host, so bare paths stay on the right school.
  const withTenant = (p: string) => (slug && !onSubdomain ? `/t/${slug}${p}` : p);
  const signUpHref = withTenant("/sign-up");
  const forgotHref = withTenant("/forgot-password");

  // School identity for the branded login: logo + name + brand colors, looked
  // up by slug. BOTH the hero/primary and the accent are driven by the tenant's
  // configured brand (brandDark / brandLight). The hexes below are only neutral
  // fallbacks for tenants that haven't set a brand yet — NOT baked-in Montaigne
  // colours, which used to leak onto every school's login screen.
  const tenantRow = slug
    ? await unscopedDb().tenant.findFirst({
        where: { slug },
        select: {
          name: true,
          logoUrl: true,
          brandLight: true,
          brandDark: true,
        },
      })
    : null;
  const tenantName = tenantRow?.name ?? tenant ?? tApp("name");
  const logoUrl = tenantRow?.logoUrl ?? null;
  const accent = (tenantRow?.brandLight || "#2CB547").trim();
  const primary = (tenantRow?.brandDark || "#143A6B").trim();

  // Per-tenant campus photo served from /public (drop the file as
  // `login-<slug>.jpg`). Missing file simply falls back to the navy hero.
  const heroPhoto = slug ? `/login-${slug}.jpg` : null;

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
      // message. A successful sign-in throws NEXT_REDIRECT (not an
      // AuthError) — that must be re-thrown so Next performs the redirect.
      if (err instanceof AuthError) {
        const qs = new URLSearchParams({ error: "CredentialsSignin" });
        if (typeof slug === "string" && slug.length > 0) qs.set("tenant", slug);
        redirect(`/sign-in?${qs.toString()}`);
      }
      throw err;
    }
  }

  async function signInWithMicrosoft() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: "/post-signin" });
  }

  const brandVars = {
    "--lm-primary": primary,
    "--lm-primary-hover": `color-mix(in oklab, ${primary}, black 22%)`,
    "--lm-accent": accent,
  } as CSSProperties;

  // Reusable hero overlay (campus photo + navy gradient + school name). Shown
  // full-height beside the form on lg+, and as a compact banner on mobile.
  const heroBackdrop = (
    <>
      <div className="absolute inset-0 bg-[color:var(--lm-primary)]" aria-hidden />
      {heroPhoto ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${heroPhoto}')` }}
          aria-hidden
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--lm-primary), black 22%) 0%, color-mix(in srgb, var(--lm-primary), transparent 45%) 48%, color-mix(in srgb, var(--lm-primary), transparent 82%) 100%)",
        }}
        aria-hidden
      />
    </>
  );

  return (
    <main style={brandVars} className="min-h-screen bg-[color:var(--color-background)]">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_minmax(26rem,0.85fr)]">
        {/* ── Hero / campus photo (lg+) ─────────────────────────────── */}
        <section className="relative hidden overflow-hidden lg:block">
          {heroBackdrop}
          <div className="relative flex h-full flex-col justify-between p-12">
            <div className="flex items-center gap-2 text-sm font-medium text-white/85">
              <span className="inline-block size-2 rounded-full bg-[color:var(--lm-accent)]" aria-hidden />
              {tApp("name")}
            </div>
            <div className="max-w-md">
              {cycleYear ? (
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">
                  <span className="inline-block size-1.5 rounded-full bg-[color:var(--lm-accent)]" aria-hidden />
                  {t("noAccountTitle", { year: cycleYear })}
                </span>
              ) : null}
              <h2 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-white">
                {tenantName}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-white/80">{t("heroLead")}</p>
            </div>
          </div>
        </section>

        {/* ── Sign-in form ──────────────────────────────────────────── */}
        <section className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
            {/* Mobile-only compact hero banner */}
            <div className="relative mb-8 h-28 overflow-hidden rounded-[0.9rem] lg:hidden">
              {heroBackdrop}
              <div className="relative flex h-full items-end p-4">
                <p className="text-lg font-semibold text-white">{tenantName}</p>
              </div>
            </div>

            <div className="mb-8 flex flex-col items-center text-center">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external tenant logo URL
                <img
                  src={logoUrl}
                  alt={tenantName}
                  className="h-20 w-auto object-contain"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-[0.75rem] bg-[color:var(--lm-primary)] text-lg font-semibold text-white shadow-card">
                  E
                </div>
              )}
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
                {t("subtitle", { tenantName })}
              </p>
            </div>

            <div className="rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
              <form action={authenticate} className="space-y-4">
                {/* Carry the tenant through the POST so a failed login redirects
                    back to the *branded* sign-in (?tenant=…), not a bare one. */}
                {slug ? <input type="hidden" name="tenantSlug" value={slug} /> : null}

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
                    {error === "NoAccount" ? t("errorNoAccount") : t("errorInvalid")}
                  </div>
                ) : null}

                <SignInSubmit label={t("submit")} pendingLabel={tCommon("loading")} />
              </form>

              {microsoftSignInEnabled ? (
                <>
                  <div className="my-5 flex items-center gap-3" aria-hidden>
                    <span className="h-px flex-1 bg-[color:var(--color-border-subtle)]" />
                    <span className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                      {t("orContinue")}
                    </span>
                    <span className="h-px flex-1 bg-[color:var(--color-border-subtle)]" />
                  </div>
                  <form action={signInWithMicrosoft}>
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground)] transition-colors duration-200 ease-out hover:bg-[color:var(--color-surface-hover)] active:scale-[0.99]"
                    >
                      <svg viewBox="0 0 21 21" className="size-4 shrink-0" aria-hidden>
                        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                      </svg>
                      {t("microsoft")}
                    </button>
                  </form>
                </>
              ) : null}
            </div>

            <p className="mt-4 text-center text-sm">
              <Link
                href={forgotHref}
                className="text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                {t("forgot")}
              </Link>
            </p>

            {/* First-time parent → inscription CTA. Only with a school context —
                at the root marketing domain there's no tenant to enrol into. */}
            {slug ? (
              <div className="mt-6 rounded-[0.75rem] border border-[color:var(--lm-accent)]/30 bg-[color:var(--lm-accent)]/8 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--lm-primary)]">
                  {cycleYear ? t("noAccountTitle", { year: cycleYear }) : t("noAccountTitleGeneric")}
                </p>
                <p className="mt-1.5 text-sm text-[color:var(--color-foreground-muted)]">
                  {t("noAccountLead")}
                </p>
                <Link
                  href={signUpHref}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--lm-accent)] px-4 py-2 text-sm font-semibold text-white shadow-card transition-all duration-200 ease-out hover:opacity-90 active:scale-[0.98]"
                >
                  {t("createAccount")}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
