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

  // The three per-navigation reads are independent — run them together
  // instead of serially (this layout renders on every authenticated page):
  // the mustChangePassword flag, the tenant brand/shell data, and nav labels.
  const [acct, tenant, tNav, years] = await Promise.all([
    unscopedDb().user.findUnique({
      where: { id: user.id },
      select: { mustChangePassword: true },
    }),
    user.tenantId
      ? unscopedDb().tenant.findUnique({
          where: { id: user.tenantId },
          select: { name: true, brandLight: true, brandDark: true, logoUrl: true },
        })
      : Promise.resolve(null),
    getTranslations("nav"),
    // Academic years for the global switcher — admins only (they can flip the
    // active year; other roles just inherit it).
    user.role === "SCHOOL_ADMIN" && user.tenantId
      ? unscopedDb().academicYear.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { startDate: "desc" },
          select: { id: true, label: true, isActive: true },
        })
      : Promise.resolve([] as { id: string; label: string; isActive: boolean }[]),
  ]);

  // Force users flagged for a password reset (e.g. bulk-onboarded parents
  // on the shared initial password) to set their own password before they
  // can use any authenticated page. /change-password lives OUTSIDE this
  // (app) group, so redirecting there does not loop.
  if (acct?.mustChangePassword) redirect("/change-password");

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
    finance: tNav("finance"),
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
        years={years}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
