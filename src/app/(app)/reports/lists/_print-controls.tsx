"use client";

import { useEffect } from "react";
import { Printer, ArrowLeft } from "lucide-react";

/**
 * Print-view controls. Auto-opens the browser print dialog shortly after
 * mount (so the user lands straight on "Save as PDF"), and offers a manual
 * re-print + back link. Hidden from the printout itself via `.no-print`.
 */
export function PrintControls({ backHref }: { backHref: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print mb-6 flex items-center justify-between gap-3 print:hidden">
      <a
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour au rapport
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-500)] px-3 py-1.5 text-sm font-medium text-white transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
      >
        <Printer className="size-3.5" aria-hidden />
        Imprimer / PDF
      </button>
    </div>
  );
}
