import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * 404 for routes inside (app) — e.g. a stale student/parent id or a removed
 * page. Themed card with a role-aware way back (/post-signin routes each role
 * to its own home), instead of the raw Next.js 404.
 */
export default function AppNotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
            <Compass className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-[color:var(--color-foreground)]">
              Page introuvable
            </h1>
            <p className="text-sm text-[color:var(--color-foreground-muted)]">
              Cette page n’existe pas ou a été déplacée.
            </p>
          </div>
          <LinkButton href="/post-signin" variant="secondary">
            Retour à l’accueil
          </LinkButton>
        </CardBody>
      </Card>
    </main>
  );
}
