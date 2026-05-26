"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  type DossierTab,
  type TabsCompleted,
  type TabsConfig,
  visibleTabs,
} from "@/lib/dossier-tabs";

/**
 * Top tab strip on the dossier edit page. Mirrors the Eduka pattern:
 * each tab shows either a green "REMPLI" checkmark or a red "À REMPLIR"
 * pill, and the active tab is highlighted with the brand colour.
 *
 * Renders as anchors (?tab=foo) so navigation works without JS — handy
 * for the parent's first-load experience and respects the back button.
 */
export function DossierTabStrip({
  baseHref,
  current,
  visibility,
  completed,
}: {
  baseHref: string; // e.g. "/parent/inscriptions/abc123/edit"
  current: DossierTab;
  visibility: TabsConfig;
  completed: TabsCompleted;
}) {
  const t = useTranslations("dossier");
  const tabs = visibleTabs(visibility);

  return (
    <nav
      aria-label={t("tabsAriaLabel")}
      className="flex flex-wrap gap-1 border-b border-[color:var(--color-border-subtle)] pb-px"
    >
      {tabs.map((tab) => {
        const active = tab === current;
        const done = completed[tab] === true;
        return (
          <Link
            key={tab}
            href={`${baseHref}?tab=${tab}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "relative inline-flex items-center gap-2 rounded-t-md border-b-2 border-[color:var(--color-brand-600)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-sm font-semibold text-[color:var(--color-foreground)] transition-colors"
                : "inline-flex items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]"
            }
          >
            <span>{t(`tab.${tab}`)}</span>
            {done ? (
              <span
                aria-label={t("badgeFilled")}
                className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--color-success-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-success-soft-fg)]"
              >
                <Check className="size-2.5" strokeWidth={3} aria-hidden />
                {t("badgeFilledShort")}
              </span>
            ) : (
              <span
                aria-label={t("badgeEmpty")}
                className="inline-flex items-center rounded-full bg-[color:var(--color-danger)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-danger)]"
              >
                {t("badgeEmpty")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
