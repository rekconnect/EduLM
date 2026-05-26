"use client";

import { useEffect, useState } from "react";
import { MousePointerClick, X } from "lucide-react";
import { usePreviewEditMode } from "@/components/dossier/preview-edit-mode-context";

/**
 * Teaching banner shown on the WYSIWYG preview route until the admin
 * either clicks a pencil (= opens the drawer once) OR explicitly
 * dismisses it via the X. The decision is persisted in localStorage
 * under `STORAGE_KEY` so it stays dismissed across reloads.
 *
 * Render inside <PreviewEditModeProvider> — the auto-dismiss listens
 * to `activeFieldKey` transitions from null → set.
 */
const STORAGE_KEY = "edulm.wysiwyg.firstTimeBannerDismissed";

export function FirstTimeBanner() {
  // Default to "dismissed" while we hydrate so we don't flash the banner
  // for a returning admin. Once mounted we read localStorage and flip
  // back to "shown" only when this is genuinely the first visit.
  const [dismissed, setDismissed] = useState(true);
  const { activeFieldKey } = usePreviewEditMode();

  // Hydration step — only runs in the browser.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setDismissed(stored === "1");
    } catch {
      // localStorage can throw in some sandboxed contexts; treat as
      // "first visit" and show the banner.
      setDismissed(false);
    }
  }, []);

  // Auto-dismiss the moment the admin opens the drawer for any field —
  // that proves they've understood the affordance.
  useEffect(() => {
    if (activeFieldKey && !dismissed) {
      dismiss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFieldKey]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignored — non-persistent dismiss is acceptable in private mode
    }
  }

  if (dismissed) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-[color:var(--color-brand-500)]/30 bg-[color:var(--color-brand-50)] px-4 py-3 text-sm text-[color:var(--color-brand-700)] shadow-card"
      role="status"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand-100)] text-[color:var(--color-brand-700)]">
        <MousePointerClick className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Survolez n&apos;importe quel champ pour le personnaliser.
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--color-brand-700)]/80">
          Un crayon apparaît en haut à droite du champ — cliquez-le pour
          renommer le libellé, le rendre optionnel ou le masquer.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[color:var(--color-brand-700)] transition-colors hover:bg-[color:var(--color-brand-100)]"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
