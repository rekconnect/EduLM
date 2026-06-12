"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type TransportLeaf = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  content: React.ReactNode;
};
export type TransportGroup = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: TransportLeaf[];
};

/**
 * Vertical left nav for the transport module — expandable GROUPS
 * (Etudiants, Autocars) with sub-tabs under each. Same visual language as
 * FicheTabs; content remounts per leaf (key) to avoid stale editor state.
 */
export function TransportTabs({ groups }: { groups: TransportGroup[] }) {
  const firstLeaf = groups[0]?.items[0]?.id ?? "";
  const [active, setActive] = useState(firstLeaf);
  const [open, setOpen] = useState<Set<string>>(new Set(groups[0] ? [groups[0].id] : []));
  const current =
    groups.flatMap((g) => g.items).find((l) => l.id === active) ?? groups[0]?.items[0];

  function toggleGroup(id: string) {
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-[230px_1fr]">
      <nav
        aria-label="Sections du module transport"
        className="flex flex-col gap-0.5 self-start rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-2 shadow-card"
      >
        {groups.map((g) => {
          const isOpen = open.has(g.id);
          const hasActive = g.items.some((l) => l.id === current?.id);
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-semibold transition-colors duration-150 ease-out",
                  hasActive
                    ? "text-[color:var(--color-foreground)]"
                    : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]",
                )}
              >
                <span className="shrink-0 text-[color:var(--color-foreground-subtle)]">{g.icon}</span>
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-[color:var(--color-foreground-subtle)] transition-transform duration-200 ease-out",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {isOpen ? (
                <div className="ms-3 flex flex-col gap-0.5 border-s border-[color:var(--color-border-subtle)] ps-2 pb-1">
                  {g.items.map((l) => {
                    const isActive = l.id === current?.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setActive(l.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-1.5 text-start text-sm transition-colors duration-150 ease-out",
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
                          {l.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{l.label}</span>
                        {typeof l.badge === "number" && l.badge > 0 ? (
                          <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 text-[10px] font-semibold tabular-nums text-[color:var(--color-foreground-muted)]">
                            {l.badge}
                          </span>
                        ) : typeof l.badge === "string" && l.badge ? (
                          <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 text-[10px] font-semibold text-[color:var(--color-foreground-muted)]">
                            {l.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="min-w-0" key={current?.id}>
        {current?.content}
      </div>
    </div>
  );
}
