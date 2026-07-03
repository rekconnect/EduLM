"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * Error boundary for every route inside (app). The sidebar (from
 * (app)/layout) stays mounted; this fills the content slot with a themed
 * card + a retry action instead of Next.js's unstyled default error screen.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability (swap for real logging once wired).
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
            <AlertTriangle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-[color:var(--color-foreground)]">
              Une erreur est survenue
            </h1>
            <p className="text-sm text-[color:var(--color-foreground-muted)]">
              Cette page n’a pas pu se charger. Réessayez, ou revenez dans un
              instant.
            </p>
          </div>
          <Button type="button" onClick={reset} className="gap-2">
            <RefreshCw className="size-4" aria-hidden />
            Réessayer
          </Button>
        </CardBody>
      </Card>
    </main>
  );
}
