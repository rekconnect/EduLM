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
        { label: t("students"), href: "/students" },
        { label: t("classes"), href: "/classes" },
        { label: t("settings"), href: "/settings" },
      ];
    case "TEACHER":
      return [
        { label: t("dashboard"), href: "/dashboard" },
        { label: t("students"), href: "/students" },
        { label: t("attendance"), href: "/attendance" },
      ];
    case "PARENT":
      return [
        { label: t("dashboard"), href: "/dashboard" },
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
            href={role === "SUPER_ADMIN" ? "/super-admin" : "/dashboard"}
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
