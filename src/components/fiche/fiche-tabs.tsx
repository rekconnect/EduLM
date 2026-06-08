"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type FicheTab = {
  id: string;
  label: string;
  /** Pre-rendered icon element, e.g. <IdCard className="size-4" />. */
  icon: React.ReactNode;
  content: React.ReactNode;
  /** Optional count badge (e.g. number of siblings). */
  badge?: number;
};

/**
 * Vertical left-tab layout for a detail fiche. Tabs on the left, the active
 * section on the right. Content is rendered on the server and passed in, so
 * each tab can contain server data + client editors (EditableGroup, etc.).
 */
export function FicheTabs({ tabs }: { tabs: FicheTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="grid items-start gap-6 md:grid-cols-[210px_1fr]">
      <nav
        aria-label="Sections de la fiche"
        className="flex flex-col gap-0.5 self-start rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-2 shadow-card"
      >
        {tabs.map((t) => {
          const isActive = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors duration-150 ease-out",
                isActive
                  ? "bg-[color:var(--color-brand-50)] font-semibold text-[color:var(--color-brand-700)]"
                  : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]",
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-[color:var(--color-brand-600)]"
                    : "text-[color:var(--color-foreground-subtle)]",
                )}
              >
                {t.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
              {typeof t.badge === "number" && t.badge > 0 ? (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 text-[10px] font-semibold tabular-nums text-[color:var(--color-foreground-muted)]">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0">{current?.content}</div>
    </div>
  );
}
