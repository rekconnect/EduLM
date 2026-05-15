import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/lib/auth";
import { postSignInPath } from "@/lib/post-signin-redirect";

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
    await signIn("credentials", { ...credentials, redirectTo: "/post-signin" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-fg)]">
            {t("subtitle", { tenantName: tenant ?? tApp("name") })}
          </p>
        </div>

        <form action={authenticate} className="space-y-4">
          {tenant ? (
            <input type="hidden" name="tenantSlug" value={tenant} />
          ) : null}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[color:var(--primary)]"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              {t("password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              minLength={8}
              className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[color:var(--primary)]"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {t("errorInvalid")}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-md bg-[color:var(--primary)] px-4 py-2.5 text-sm font-medium text-[color:var(--primary-foreground)] transition hover:opacity-90"
          >
            {t("submit")}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <a href="/forgot-password" className="text-[color:var(--muted-fg)] hover:underline">
            {t("forgot")}
          </a>
        </div>
      </div>
    </main>
  );
}
