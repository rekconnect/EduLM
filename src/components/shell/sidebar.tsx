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
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import type { IconName, NavSection } from "./nav-sections";
import { ThemeToggle } from "@/components/theme-toggle";

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
};
// Keep FileText referenced (used as parent documents alias) so tree-shaker
// doesn't drop it before someone adds a route that needs it.
void FileText;

type SidebarProps = {
  role: Role;
  userLabel: string;
  tenantLabel?: string;
  sections: NavSection[];
  signOutForm: React.ReactNode;
};

export function Sidebar({
  role,
  userLabel,
  tenantLabel,
  sections,
  signOutForm,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const tNav = useTranslations("nav");

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer open on mobile.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const homeHref =
    role === "SUPER_ADMIN"
      ? "/super-admin"
      : role === "PARENT"
        ? "/parent/dashboard"
        : "/dashboard";

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={tNav("openMenu")}
          className="rounded-md p-1.5 hover:bg-[color:var(--muted)]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href={homeHref} className="text-base font-semibold tracking-tight">
          EduLM
        </Link>
        {tenantLabel ? (
          <span className="ms-auto truncate text-xs text-[color:var(--muted-fg)]">
            {tenantLabel}
          </span>
        ) : null}
      </div>

      {/* Drawer overlay on mobile */}
      {open ? (
        <button
          type="button"
          aria-label={tNav("closeMenu")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-64 flex-col bg-[color:var(--sidebar-bg)] text-[color:var(--sidebar-fg)] transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--sidebar-border)] px-5 py-4">
          <Link href={homeHref} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--primary)] text-sm font-semibold text-white">
              E
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">EduLM</span>
              {tenantLabel ? (
                <span className="text-xs text-[color:var(--sidebar-muted)] truncate max-w-[140px]">
                  {tenantLabel}
                </span>
              ) : null}
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tNav("closeMenu")}
            className="rounded-md p-1 text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)] md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className={sIdx > 0 ? "mt-4" : ""}>
              {section.title ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sidebar-muted)]">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                          active
                            ? "bg-[color:var(--sidebar-active-bg)] text-[color:var(--sidebar-active-fg)]"
                            : "text-[color:var(--sidebar-fg)] hover:bg-[color:var(--sidebar-hover-bg)]"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${active ? "" : "text-[color:var(--sidebar-muted)]"}`}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge != null ? (
                          <span
                            className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              active
                                ? "bg-white/20 text-white"
                                : "bg-[color:var(--sidebar-hover-bg)] text-[color:var(--sidebar-fg)]"
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[color:var(--sidebar-border)] px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-2">
            <span className="truncate text-xs text-[color:var(--sidebar-muted)]" title={userLabel}>
              {userLabel}
            </span>
            <ThemeToggle />
          </div>
          <div className="px-2">{signOutForm}</div>
        </div>
      </aside>
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Treat sub-routes as active (e.g. /students/abc active for /students).
  // But /admin should NOT match /admin/parents etc — require exact for short paths.
  if (href === "/") return false;
  return pathname.startsWith(href + "/");
}

// Sign-out button colored for the dark sidebar background.
export function SidebarSignOut({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[color:var(--sidebar-fg)] transition hover:bg-[color:var(--sidebar-hover-bg)]"
    >
      <LogOut className="h-4 w-4 text-[color:var(--sidebar-muted)]" />
      <span>{label}</span>
    </button>
  );
}
