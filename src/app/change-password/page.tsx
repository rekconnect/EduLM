import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/sign-out-action";
import { ChangePasswordForm } from "./_form";

/**
 * Standalone (NOT under the (app) shell) so the forced-change redirect in
 * the (app) layout can send users here without a redirect loop.
 *
 * Reached when a user has mustChangePassword = true — e.g. bulk-onboarded
 * parents on the shared initial password. They can't use the app until
 * they set their own password here.
 */
export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] px-6 py-16">
      <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-[0.75rem] bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
            Choisissez votre mot de passe
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
            Pour votre sécurité, veuillez remplacer le mot de passe initial
            avant d&apos;accéder à votre espace.
          </p>
        </div>

        <div className="rounded-[0.75rem] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
          <ChangePasswordForm />
        </div>

        <p className="mt-4 text-center text-sm text-[color:var(--color-foreground-muted)]">
          Connecté en tant que {session.user.email}.{" "}
          <form action={signOutAction} className="inline">
            <button
              type="submit"
              className="text-[color:var(--color-foreground)] underline hover:no-underline"
            >
              Se déconnecter
            </button>
          </form>
        </p>
      </div>
    </main>
  );
}
