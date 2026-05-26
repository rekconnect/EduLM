"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  type DossierTab,
  type TabsCompleted,
  type TabsConfig,
  allTabsComplete,
  tabsRemainingCount,
  visibleTabs,
} from "@/lib/dossier-tabs";
import { submitDossier } from "@/app/(app)/parent/inscriptions/_actions";

/**
 * Sticky bottom action bar shown on every tab of the dossier. Three
 * buttons: Précédent · Envoyer le dossier · Suivant. The Envoyer CTA is
 * faded until every visible tab is marked complete; clicking it fires
 * the server action passed in via `onSubmit`.
 *
 * Précédent / Suivant are plain anchors (?tab=foo) so they don't need
 * JS to wire up — keeps the page snappy on first paint.
 */
export function DossierBottomBar({
  baseHref,
  current,
  visibility,
  completed,
  applicationId,
}: {
  baseHref: string;
  current: DossierTab;
  visibility: TabsConfig;
  completed: TabsCompleted;
  /** When provided, the Envoyer-le-dossier CTA submits the dossier
   *  via the server action. Omit on read-only views. */
  applicationId?: string;
}) {
  const t = useTranslations("dossier");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  const tabs = visibleTabs(visibility);
  const idx = tabs.indexOf(current);
  const prev = idx > 0 ? tabs[idx - 1] : null;
  const next = idx >= 0 && idx < tabs.length - 1 ? tabs[idx + 1] : null;
  const canSubmit = allTabsComplete(visibility, completed);
  const remaining = tabsRemainingCount(visibility, completed);

  function onSubmitClick() {
    if (!canSubmit || !applicationId) return;
    startTransition(async () => {
      const r = await submitDossier(applicationId);
      if (r.ok) {
        toast.success(t("submittedToast"));
      } else if (r.error === "missing-required" && r.missing) {
        toast.error(`${t("submitError")}: ${r.missing.join(", ")}`);
      } else {
        toast.error(r.error || t("submitError"));
      }
    });
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-6 mt-8 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        {/* Précédent — disabled state still rendered for layout stability */}
        {prev ? (
          <Link
            href={`${baseHref}?tab=${prev}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-sunken)]"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
            {t("prev")}
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
            {t("prev")}
          </span>
        )}

        {/* Envoyer le dossier — faded until complete */}
        <button
          type="button"
          onClick={onSubmitClick}
          disabled={!canSubmit || pending || !applicationId}
          className={
            canSubmit
              ? "inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-700)] disabled:opacity-70"
              : "inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)]/40 px-4 py-1.5 text-sm font-semibold text-white"
          }
          aria-disabled={!canSubmit}
          title={
            !canSubmit
              ? t("submitDisabledHint", { count: remaining })
              : undefined
          }
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          {pending ? tCommon("loading") : t("submit")}
        </button>

        {/* Suivant */}
        {next ? (
          <Link
            href={`${baseHref}?tab=${next}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-sunken)]"
          >
            {t("next")}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          >
            {t("next")}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}

/** Small "À COMPLÉTER: N" pill displayed top-right of every tab. */
export function DossierRemainingPill({
  visibility,
  completed,
}: {
  visibility: TabsConfig;
  completed: TabsCompleted;
}) {
  const t = useTranslations("dossier");
  const remaining = tabsRemainingCount(visibility, completed);
  if (remaining === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-success-soft-fg)]">
        <Check className="size-3" strokeWidth={3} aria-hidden />
        {t("allTabsCompleted")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[color:var(--color-danger)]/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-danger)]">
      {t("remaining", { count: remaining })}
    </span>
  );
}
