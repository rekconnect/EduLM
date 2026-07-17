"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { Bell, Check } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/staff/_notifications-actions";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type BellItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string; // ISO
};

export function NotificationBell({
  items,
  unreadCount,
  collapsed,
}: {
  items: BellItem[];
  unreadCount: number;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const t = useTranslations("staff");
  const format = useFormatter();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (it: BellItem) => {
    setOpen(false);
    if (!it.read) startTransition(() => void markNotificationRead(it.id));
    if (it.href) router.push(it.href);
  };

  const markAll = () =>
    startTransition(async () => {
      await markAllNotificationsRead();
    });

  const button = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label={t("notifications")}
      aria-expanded={open}
      className="relative flex size-9 items-center justify-center rounded-md text-[color:var(--sidebar-muted)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)]"
    >
      <Bell className="size-4" />
      {unreadCount > 0 ? (
        <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[color:var(--color-brand-500)] px-1 text-[10px] font-semibold leading-4 text-[color:var(--color-foreground-onbrand)]">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {t("notifications")}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}

      {open ? (
        <div
          role="dialog"
          aria-label={t("notifications")}
          className="absolute bottom-full end-0 z-50 mb-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)] shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--color-border-subtle)] px-3 py-2">
            <span className="text-sm font-semibold">{t("notifications")}</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--color-brand-600)] transition-colors hover:underline"
              >
                <Check className="size-3.5" aria-hidden />
                {t("markAllRead")}
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-muted)]">
                {t("noNotifications")}
              </p>
            ) : (
              <ul className="divide-y divide-[color:var(--color-border-subtle)]">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => openItem(it)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-start transition-colors hover:bg-[color:var(--color-surface-hover)]",
                        !it.read && "bg-[color:var(--color-brand-500)]/5",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        {!it.read ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-brand-500)]" aria-hidden />
                        ) : null}
                        <span className={cn("flex-1 truncate text-sm", !it.read && "font-medium")}>
                          {it.title}
                        </span>
                        <time className="shrink-0 text-[10px] text-[color:var(--color-foreground-subtle)]">
                          {format.relativeTime(new Date(it.createdAt))}
                        </time>
                      </div>
                      {it.body ? (
                        <span className="line-clamp-2 ps-3.5 text-xs text-[color:var(--color-foreground-muted)]">
                          {it.body}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
