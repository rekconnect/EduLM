import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "./_form";

export default async function SignUpPage() {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) notFound();

  const t = await getTranslations("admissions");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] px-6 py-16">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
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
          <SignUpForm tenantSlug={slug} />
        </div>

        <p className="mt-4 text-center text-sm">
          <Link
            href={`/t/${slug}/sign-in`}
            className="text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
          >
            {t("signUpAlready")}
          </Link>
        </p>
      </div>
    </main>
  );
}
