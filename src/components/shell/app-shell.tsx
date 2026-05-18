import { getTranslations } from "next-intl/server";
import type { Role } from "@prisma/client";
import { signOut } from "@/lib/auth";
import { Sidebar, SidebarSignOut } from "./sidebar";
import { navSectionsForRole } from "./nav-sections";

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

  const signOutForm = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <SidebarSignOut label={tNav("signOut")} />
    </form>
  );

  return (
    <div className="min-h-screen md:flex">
      <Sidebar
        role={role}
        userLabel={userLabel}
        tenantLabel={tenantLabel}
        sections={sections}
        signOutForm={signOutForm}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
