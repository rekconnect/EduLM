"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Construction, Check, Loader2 } from "lucide-react";
import { setDossierTabCompleted } from "../../_actions";

/**
 * Placeholder rendered for dossier tabs whose content isn't built yet
 * (Foyer / Scolarité / Transport / Contacts / Validation, until later
 * phases land). Lets the parent (or QA) flip a "mark this tab complete"
 * toggle so they can preview the Envoyer-le-dossier flow end-to-end.
 *
 * This component goes away in Phase 2-4 as each tab gets real content.
 */
export function DossierTabPlaceholder({
  applicationId,
  tab,
  completed,
}: {
  applicationId: string;
  tab: string;
  completed: boolean;
}) {
  const t = useTranslations("dossier");
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      const r = await setDossierTabCompleted(applicationId, tab, !completed);
      if (!r.ok) toast.error(t("submitError"));
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] p-10 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]">
        <Construction className="size-6" aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
        {t(`tab.${tab}` as never)}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[color:var(--color-foreground-muted)]">
        {t("placeholderLead")}
      </p>

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className={
          completed
            ? "mt-6 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-success-soft)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-success-soft-fg)] transition-colors disabled:opacity-60"
            : "mt-6 inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-60"
        }
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : completed ? (
          <Check className="size-3.5" aria-hidden />
        ) : null}
        {completed ? t("placeholderMarkedCta") : t("placeholderMarkCta")}
      </button>
    </div>
  );
}
