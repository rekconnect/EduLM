import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sidebar } from "@/components/shell/sidebar";
import {
  childrenNavSections,
  grantedNavSections,
  navSectionsForRole,
} from "@/components/shell/nav-sections";
import { ACCOUNT_DISABLED_PATH, effectiveStaffRole, liveAccount, requireUser } from "@/lib/session";
import { unscopedDb } from "@/lib/db";
import { getStaffShellData } from "@/lib/staff-portal";
import { getAdminAccess, hasModule, type AdminAccess } from "@/lib/permissions";
import { parentUnreadCount, schoolUnreadCount } from "@/lib/messaging";

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
  const jwtUser = await requireUser();
  // Disabled / deleted / revoked since sign-in → no shell at all.
  const liveRow = await liveAccount(jwtUser);
  if (!liveRow) redirect(ACCOUNT_DISABLED_PATH);
  const user = { ...jwtUser, role: liveRow.role, email: liveRow.email };
  // Double profil: a PARENT who is also personnel acts with their staff hat
  // (TEACHER/STAFF) and keeps every parent surface under "Mes enfants".
  const eff = await effectiveStaffRole(user);
  const isStaffParent = user.role === "PARENT" && eff !== null;
  const navRole = eff ?? user.role;

  // The three per-navigation reads are independent — run them together
  // instead of serially (this layout renders on every authenticated page):
  // the mustChangePassword flag, the tenant brand/shell data, and nav labels.
  const [acct, tenant, tNav, years, staffShell, adminAccess, parentUnread, schoolUnread] = await Promise.all([
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
    getStaffShellData(user),
    // Module grants (permissions console): TEACHER/STAFF by role or by hat —
    // admins see everything via their role branch already.
    eff === "TEACHER" || eff === "STAFF"
      ? getAdminAccess(user)
      : Promise.resolve(null as AdminAccess | null),
    // Messagerie unread badges: a parent's own conversations...
    user.tenantId && user.role === "PARENT"
      ? parentUnreadCount(user.tenantId, user.id)
      : Promise.resolve(0),
    // ...and the school inbox for anyone with a staff capability (shown only
    // if they may see the inbox). A staff-parent gets both.
    user.tenantId && eff ? schoolUnreadCount(user.tenantId) : Promise.resolve(0),
  ]);

  // Force users flagged for a password reset (e.g. bulk-onboarded parents
  // on the shared initial password) to set their own password before they
  // can use any authenticated page. /change-password lives OUTSIDE this
  // (app) group, so redirecting there does not loop.
  if (acct?.mustChangePassword) redirect("/change-password");

  const navLabels = {
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
    myMessages: tNav("myMessages"),
    sectionChildren: tNav("sectionChildren"),
    childrenHome: tNav("childrenHome"),
    settings: tNav("settings"),
    reports: tNav("reports"),
    transport: tNav("transport"),
    cantine: tNav("cantine"),
    infirmerie: tNav("infirmerie"),
    finance: tNav("finance"),
    payroll: tNav("payroll"),
    inscriptionForm: tNav("inscriptionForm"),
    myPayslips: tNav("myPayslips"),
    myRequests: tNav("myRequests"),
    teamApprovals: tNav("teamApprovals"),
    staffRequests: tNav("staffRequests"),
    holidays: tNav("holidays"),
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
    accounts: tNav("accounts"),
    permissions: tNav("permissions"),
    sectionGranted: tNav("sectionGranted"),
    sectionSuperAdmin: tNav("sectionSuperAdmin"),
  };
  let sections = navSectionsForRole(navRole, navLabels, {
    hasEmployee: staffShell?.hasEmployee ?? false,
  });
  // Append the modules this TEACHER/STAFF was granted from the permissions
  // console (dedup against the role's own links, e.g. /students for profs).
  if (adminAccess && !adminAccess.all) {
    const existing = new Set(
      sections.flatMap((s) => s.items.map((i) => i.href)),
    );
    sections = [
      ...sections,
      ...grantedNavSections(adminAccess.grants, navLabels, existing),
    ];
  }
  if (isStaffParent) sections = [...sections, ...childrenNavSections(navLabels)];

  // Decorate the nav with attendance-request state: hide "Team approvals" for
  // staff who supervise nobody, and badge the pending queues.
  const decoratedSections = staffShell
    ? sections.map((section) => ({
        ...section,
        items: section.items
          .filter((item) => item.href !== "/staff/approvals" || staffShell.isSupervisor)
          .map((item) => {
            if (item.href === "/staff/approvals" && staffShell.supervisorPending > 0)
              return { ...item, badge: staffShell.supervisorPending };
            if (item.href === "/payroll/requests" && staffShell.financePending > 0)
              return { ...item, badge: staffShell.financePending };
            return item;
          }),
      }))
    : sections;

  // Unread-message badges. Staff only see the inbox count when the inbox is
  // theirs to see (SCHOOL_ADMIN, or a Communication grant).
  const canSeeInbox =
    user.role === "SCHOOL_ADMIN" ||
    (adminAccess !== null && hasModule(adminAccess, "communication", "read"));
  const navSections =
    parentUnread > 0 || schoolUnread > 0
      ? decoratedSections.map((section) => ({
          ...section,
          items: section.items.map((item) => {
            if (item.href === "/parent/messages" && user.role === "PARENT" && parentUnread > 0)
              return { ...item, badge: parentUnread };
            if (item.href === "/admin/messages" && canSeeInbox && schoolUnread > 0)
              return { ...item, badge: schoolUnread };
            return item;
          }),
        }))
      : decoratedSections;

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
        role={navRole}
        userLabel={user.name ?? user.email}
        tenantLabel={tenant?.name}
        sections={navSections}
        signOutLabel={tNav("signOut")}
        logoUrl={tenant?.logoUrl ?? null}
        years={years}
        notifications={staffShell?.notifications}
        unreadCount={staffShell?.unreadCount}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
