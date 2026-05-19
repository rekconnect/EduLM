import { getTranslations } from "next-intl/server";
import type { Role } from "@prisma/client";
import { Sidebar } from "./sidebar";
import { navSectionsForRole } from "./nav-sections";
import { requireUser } from "@/lib/session";
import { unscopedDb } from "@/lib/db";

export async function AppShell({
  role,
  userLabel,
  tenantLabel,
  children,
}: {
  role: Role;
  userLabel: string;
  tenantLabel?: string;
  children: React.ReactNode;
}) {
  const tNav = await getTranslations("nav");

  const sections = navSectionsForRole(role, {
    dashboard: tNav("dashboard"),
    admissions: tNav("admissions"),
    students: tNav("students"),
    parents: tNav("parents"),
    classes: tNav("classes"),
    years: tNav("years"),
    documents: tNav("documents"),
    announcements: tNav("announcements"),
    messages: tNav("messages"),
    attendance: tNav("attendance"),
    discipline: tNav("discipline"),
    billing: tNav("billing"),
    contact: tNav("contact"),
    settings: tNav("settings"),
    myApplications: tNav("myApplications"),
    myAnnouncements: tNav("myAnnouncements"),
    myDocuments: tNav("myDocuments"),
    myInvoices: tNav("myInvoices"),
    tenants: tNav("tenants"),
    sectionAdmissions: tNav("sectionAdmissions"),
    sectionDaily: tNav("sectionDaily"),
    sectionCommunication: tNav("sectionCommunication"),
    sectionConfig: tNav("sectionConfig"),
    sectionAccount: tNav("sectionAccount"),
    sectionSuperAdmin: tNav("sectionSuperAdmin"),
  });

  // Per-tenant brand + logo override. AppShell is the natural home — it wraps
  // every authenticated screen. Super-admin has no tenant so we skip.
  const user = await requireUser();
  let brand: {
    brandLight: string | null;
    brandDark: string | null;
    logoUrl: string | null;
  } | null = null;
  if (user.tenantId) {
    brand = await unscopedDb().tenant.findUnique({
      where: { id: user.tenantId },
      select: { brandLight: true, brandDark: true, logoUrl: true },
    });
  }

  // CSS variables injected on the .tenant-scope wrapper. globals.css picks
  // these up and remaps --color-brand-500 to them when set; falls back to
  // the platform default sky-blue otherwise.
  const brandStyle = {
    ...(brand?.brandLight ? { "--brand-override-light": brand.brandLight } : {}),
    ...(brand?.brandDark ? { "--brand-override-dark": brand.brandDark } : {}),
  } as React.CSSProperties;

  return (
    <div
      className="tenant-scope min-h-screen md:flex"
      style={brandStyle}
    >
      <Sidebar
        role={role}
        userLabel={userLabel}
        tenantLabel={tenantLabel}
        sections={sections}
        signOutLabel={tNav("signOut")}
        logoUrl={brand?.logoUrl ?? null}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
