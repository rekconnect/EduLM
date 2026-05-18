import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Role } from "@prisma/client";
import { SignOutButton } from "@/components/sign-out-button";

type NavItem = { label: string; href: string };

async function navForRole(role: Role): Promise<NavItem[]> {
  const t = await getTranslations("nav");
  switch (role) {
    case "SUPER_ADMIN":
      return [
        { label: "Tenants", href: "/super-admin" },
      ];
    case "SCHOOL_ADMIN":
      return [
        { label: t("dashboard"), href: "/dashboard" },
        { label: t("admissions"), href: "/admissions-admin" },
        { label: t("students"), href: "/students" },
        { label: t("classes"), href: "/classes" },
        { label: "Années", href: "/admin/years" },
        { label: "Documents", href: "/admin/documents" },
        { label: "Annonces", href: "/admin/announcements" },
        { label: "Messages", href: "/admin/messages" },
        { label: t("attendance"), href: "/attendance" },
        { label: t("discipline"), href: "/discipline" },
        { label: t("billing"), href: "/billing" },
      ];
    case "TEACHER":
      return [
        { label: t("dashboard"), href: "/dashboard" },
        { label: t("students"), href: "/students" },
        { label: t("attendance"), href: "/attendance" },
        { label: t("discipline"), href: "/discipline" },
      ];
    case "PARENT":
      return [
        { label: t("dashboard"), href: "/parent/dashboard" },
        { label: t("applications"), href: "/parent/applications" },
        { label: "Documents", href: "/parent/documents" },
        { label: "Annonces", href: "/parent/announcements" },
        { label: t("billing"), href: "/parent/invoices" },
        { label: "Contact", href: "/parent/contact" },
      ];
  }
}

export async function AppHeader({
  role,
  userLabel,
  tenantLabel,
}: {
  role: Role;
  userLabel: string;
  tenantLabel?: string;
}) {
  const t = await getTranslations("nav");
  const nav = await navForRole(role);

  return (
    <header className="border-b border-[color:var(--border)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link
            href={
              role === "SUPER_ADMIN"
                ? "/super-admin"
                : role === "PARENT"
                  ? "/parent/dashboard"
                  : "/dashboard"
            }
            className="text-base font-semibold tracking-tight"
          >
            EduLM
          </Link>
          {tenantLabel ? (
            <span className="hidden text-sm text-[color:var(--muted-fg)] sm:inline">
              {tenantLabel}
            </span>
          ) : null}
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--muted-fg)] transition hover:bg-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-[color:var(--muted-fg)] sm:inline">
            {userLabel}
          </span>
          <SignOutButton label={t("signOut")} />
        </div>
      </div>
    </header>
  );
}
