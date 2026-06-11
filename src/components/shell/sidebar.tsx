"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  FileSpreadsheet,
  Users,
  GraduationCap,
  School,
  Calendar,
  FolderOpen,
  Megaphone,
  Inbox,
  CalendarCheck,
  AlertTriangle,
  Receipt,
  FileText,
  MessageSquare,
  Building2,
  Settings,
  BarChart3,
  ClipboardEdit,
  Bus,
  UtensilsCrossed,
  HeartPulse,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Role } from "@prisma/client";
import type { IconName, NavItem, NavSection } from "./nav-sections";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/sign-out-action";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  admissions: FileSpreadsheet,
  students: GraduationCap,
  parents: Users,
  classes: School,
  years: Calendar,
  documents: FolderOpen,
  announcements: Megaphone,
  messages: Inbox,
  attendance: CalendarCheck,
  discipline: AlertTriangle,
  billing: Receipt,
  contact: MessageSquare,
  tenants: Building2,
  settings: Settings,
  reports: BarChart3,
  inscriptionForm: ClipboardEdit,
  transport: Bus,
  cantine: UtensilsCrossed,
  infirmerie: HeartPulse,
};
void FileText;

const COLLAPSED_KEY = "edulm:sidebar:collapsed";

type SidebarProps = {
  role: Role;
  userLabel: string;
  tenantLabel?: string;
  sections: NavSection[];
  signOutLabel: string;
  logoUrl?: string | null;
};

export function Sidebar({
  role,
  userLabel,
  tenantLabel,
  sections,
  signOutLabel,
  logoUrl,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const shouldReduce = useReducedMotion();

  // Hydrate collapse state from localStorage (after mount to avoid SSR mismatch).
  useEffect(() => {
    setMounted(true);
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === "true") {
        setCollapsed(true);
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR, etc.) — silent skip.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed, mounted]);

  // Close mobile drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer open on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const homeHref =
    role === "SUPER_ADMIN"
      ? "/super-admin"
      : role === "PARENT"
        ? "/parent/dashboard"
        : "/dashboard";

  return (
    <TooltipProvider delayDuration={250}>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={tNav("openMenu")}
          className="rounded-md p-1.5 text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
        >
          <Menu className="size-5" />
        </button>
        <Link
          href={homeHref}
          className="text-base font-semibold tracking-tight text-[color:var(--color-foreground)]"
        >
          EduLM
        </Link>
        {tenantLabel ? (
          <span className="ms-auto truncate text-xs text-[color:var(--color-foreground-muted)]">
            {tenantLabel}
          </span>
        ) : null}
      </div>

      {/* Mobile drawer scrim */}
      {open ? (
        <button
          type="button"
          aria-label={tNav("closeMenu")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* Sidebar */}
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "group/sidebar fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e bg-[color:var(--sidebar-bg)] text-[color:var(--sidebar-fg)]",
          "border-[color:var(--sidebar-border)]",
          "transition-[width,transform] duration-200 ease-out",
          "md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-64",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-[color:var(--sidebar-border)] px-3 py-3",
            collapsed && "md:flex-col md:items-center md:gap-2",
          )}
        >
          <Link
            href={homeHref}
            className={cn(
              "flex min-w-0 items-center gap-2",
              collapsed && "md:justify-center",
            )}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-8 shrink-0 rounded-md bg-[color:var(--color-surface-raised)] object-contain p-0.5"
              />
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-500)] text-sm font-semibold text-[color:var(--color-foreground-onbrand)]">
                E
              </div>
            )}
            <div
              className={cn(
                "flex min-w-0 flex-col leading-tight",
                collapsed && "md:hidden",
              )}
            >
              <span className="text-sm font-semibold">
                {tenantLabel || "EduLM"}
              </span>
              {tenantLabel ? (
                <span className="text-xs text-[color:var(--sidebar-muted)]">
                  EduLM
                </span>
              ) : null}
            </div>
          </Link>

          {/* Mobile close (always visible on mobile, never on desktop) */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tNav("closeMenu")}
            className="ms-auto rounded-md p-1 text-[color:var(--sidebar-muted)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)] md:hidden"
          >
            <X className="size-5" />
          </button>

          {/* Desktop collapse toggle (never on mobile) */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={tNav("toggleSidebar")}
            aria-pressed={collapsed}
            className={cn(
              "hidden size-7 items-center justify-center rounded-md text-[color:var(--sidebar-muted)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)] md:inline-flex",
              !collapsed && "ms-auto",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        {/* Command palette trigger */}
        <div
          className={cn(
            "shrink-0",
            collapsed ? "px-1.5 pt-3" : "px-3 pt-4",
          )}
        >
          <CommandPaletteTrigger collapsed={collapsed} />
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto",
            collapsed ? "px-1.5 py-3" : "px-3 py-3",
          )}
        >
          {sections.map((section, sIdx) => (
            <div key={sIdx} className={sIdx > 0 ? "mt-4" : ""}>
              {section.title && !collapsed ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sidebar-muted)]">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <NavListItem
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    collapsed={collapsed}
                    shouldReduce={!!shouldReduce}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-[color:var(--sidebar-border)] px-3 py-3">
          <div
            className={cn(
              "mb-2 flex items-center gap-2",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            <span
              className={cn(
                "truncate px-2 text-xs text-[color:var(--sidebar-muted)]",
                collapsed && "hidden",
              )}
              title={userLabel}
            >
              {userLabel}
            </span>
            <ThemeToggle />
          </div>
          <form action={signOutAction} className={collapsed ? "flex justify-center" : ""}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="submit"
                    aria-label={signOutLabel}
                    className="flex size-9 items-center justify-center rounded-md text-[color:var(--sidebar-muted)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)]"
                  >
                    <LogOut className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {signOutLabel}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[color:var(--sidebar-fg)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)]"
              >
                <LogOut className="size-4 text-[color:var(--sidebar-muted)]" />
                <span>{signOutLabel}</span>
              </button>
            )}
          </form>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function NavListItem({
  item,
  active,
  collapsed,
  shouldReduce,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  shouldReduce: boolean;
}) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;

  const linkClass = cn(
    "relative flex items-center rounded-md text-sm transition-colors duration-150 ease-out",
    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
    active
      ? "text-[color:var(--sidebar-active-fg)]"
      : "text-[color:var(--sidebar-fg)] hover:bg-[color:var(--sidebar-hover-bg)]",
  );

  const link = (
    <Link href={item.href} className={linkClass}>
      {active ? (
        shouldReduce ? (
          <span className="absolute inset-0 rounded-md bg-[color:var(--sidebar-active-bg)]" />
        ) : (
          <motion.span
            layoutId="activeNavPill"
            className="absolute inset-0 rounded-md bg-[color:var(--sidebar-active-bg)]"
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          />
        )
      ) : null}
      <Icon
        className={cn(
          "relative z-10 size-4 shrink-0",
          !active && "text-[color:var(--sidebar-muted)]",
        )}
      />
      {!collapsed ? (
        <>
          <span className="relative z-10 flex-1 truncate">{item.label}</span>
          {item.badge != null ? (
            <span
              className={cn(
                "relative z-10 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                active
                  ? "bg-white/20 text-[color:var(--sidebar-active-fg)]"
                  : "bg-[color:var(--sidebar-hover-bg)] text-[color:var(--sidebar-fg)]",
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );

  if (!collapsed) return <li>{link}</li>;

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/") return false;
  return pathname.startsWith(href + "/");
}

function CommandPaletteTrigger({ collapsed }: { collapsed: boolean }) {
  const { setOpen } = useCommandPalette();
  const tNav = useTranslations("nav");
  // ⌘K is the convention from Linear / Notion / Vercel. The keyboard handler
  // in CommandPalette accepts both Cmd and Ctrl, so the symbol is decorative.
  const shortcutHint = "⌘K";

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={tNav("cmdkTrigger")}
            className="flex w-full items-center justify-center rounded-md py-2 text-[color:var(--sidebar-muted)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)]"
          >
            <Search className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {tNav("cmdkTrigger")} · {shortcutHint}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group flex w-full items-center gap-2 rounded-md border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-hover-bg)]/40 px-3 py-1.5 text-sm text-[color:var(--sidebar-muted)] transition-colors hover:border-[color:var(--sidebar-muted)]/40 hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)]"
    >
      <Search className="size-3.5" aria-hidden />
      <span className="flex-1 truncate text-start">
        {tNav("cmdkTrigger")}
      </span>
      <kbd className="hidden items-center rounded border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-bg)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[color:var(--sidebar-muted)] sm:inline-flex">
        {shortcutHint}
      </kbd>
    </button>
  );
}
