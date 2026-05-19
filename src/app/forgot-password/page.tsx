import Link from "next/link";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("forgotPassword");
  const tApp = await getTranslations("app");

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
            {t("subtitle", { tenantName: tApp("name") })}
          </p>
        </div>

        <div className="rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
              <KeyRound className="size-5" aria-hidden />
            </div>
            <div className="text-sm text-[color:var(--color-foreground)]">
              <p>{t("description")}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[color:var(--color-foreground-muted)]">
                <Mail className="size-3.5" aria-hidden />
                {t("contactHint")}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {t("backToSignIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}
