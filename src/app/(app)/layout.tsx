import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sidebar } from "@/components/shell/sidebar";
import { navSectionsForRole } from "@/components/shell/nav-sections";
import { requireUser } from "@/lib/session";
import { unscopedDb } from "@/lib/db";

/**
 * Layout for every authenticated page. Persistent across navigations within
 * the (app) route group — Next.js keeps this mounted while only the page
 * portion swaps. That means the tenant brand query + i18n nav load run ONCE
 * per session, not once per click. AppShell is rendered here instead of
 * inside each page (which used to make every click pay for these again).
 *
 * The route group `(app)` is URL-invisible, so URLs stay identical
 * (`/students`, `/parent/dashboard`, etc).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Force users flagged for a password reset (e.g. bulk-onboarded parents
  // on the shared initial password) to set their own password before they
  // can use any authenticated page. /change-password lives OUTSIDE this
  // (app) group, so redirecting there does not loop.
  const acct = await unscopedDb().user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true },
  });
  if (acct?.mustChangePassword) redirect("/change-password");

  const tNav = await getTranslations("nav");

  // One query for everything the shell needs: brand colors, logo, tenant name.
  let tenant: {
    name: string;
    brandLight: string | null;
    brandDark: string | null;
    logoUrl: string | null;
  } | null = null;
  if (user.tenantId) {
    tenant = await unscopedDb().tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, brandLight: true, brandDark: true, logoUrl: true },
    });
  }

  const sections = navSectionsForRole(user.role, {
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
    reports: tNav("reports"),
    transport: tNav("transport"),
    cantine: tNav("cantine"),
    infirmerie: tNav("infirmerie"),
    inscriptionForm: tNav("inscriptionForm"),
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

  const brandStyle = {
    ...(tenant?.brandLight
      ? { "--brand-override-light": tenant.brandLight }
      : {}),
    ...(tenant?.brandDark
      ? { "--brand-override-dark": tenant.brandDark }
      : {}),
  } as React.CSSProperties;

  return (
    <div className="tenant-scope min-h-screen md:flex" style={brandStyle}>
      <Sidebar
        role={user.role}
        userLabel={user.name ?? user.email}
        tenantLabel={tenant?.name}
        sections={sections}
        signOutLabel={tNav("signOut")}
        logoUrl={tenant?.logoUrl ?? null}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
