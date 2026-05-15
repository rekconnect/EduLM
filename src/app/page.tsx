import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");

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
            href="/sign-in"
            className="inline-flex items-center rounded-md bg-[color:var(--primary)] px-5 py-2.5 text-sm font-medium text-[color:var(--primary-foreground)] transition hover:opacity-90"
          >
            {t("ctaSignIn")}
          </Link>
          <Link
            href="#features"
            className="inline-flex items-center rounded-md border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium transition hover:bg-[color:var(--muted)]"
          >
            {t("ctaLearn")}
          </Link>
        </div>
      </div>
    </main>
  );
}
