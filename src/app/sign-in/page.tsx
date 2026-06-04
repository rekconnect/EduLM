import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/lib/auth";
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
      </div>
    </main>
  );
}
