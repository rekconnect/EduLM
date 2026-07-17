import type { Role } from "@prisma/client";

// Icon name keys — resolved to lucide components inside the client Sidebar.
// (React components have non-serializable internals and can't cross the
// Server → Client boundary.)
export type IconName =
  | "dashboard"
  | "admissions"
  | "students"
  | "parents"
  | "classes"
  | "years"
  | "documents"
  | "announcements"
  | "messages"
  | "attendance"
  | "discipline"
  | "billing"
  | "contact"
  | "tenants"
  | "settings"
  | "reports"
  | "inscriptionForm"
  | "transport"
  | "cantine"
  | "infirmerie"
  | "finance"
  | "payroll"
  | "requests"
  | "approvals"
  | "holidays";

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Optional badge (count or string) shown on the right of the link. */
  badge?: number | string;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

type Labels = {
  dashboard: string;
  admissions: string;
  students: string;
  parents: string;
  classes: string;
  years: string;
  documents: string;
  announcements: string;
  messages: string;
  attendance: string;
  discipline: string;
  billing: string;
  contact: string;
  settings: string;
  reports: string;
  transport: string;
  cantine: string;
  infirmerie: string;
  finance: string;
  payroll: string;
  inscriptionForm: string;
  myPayslips: string;
  myRequests: string;
  teamApprovals: string;
  staffRequests: string;
  holidays: string;
  myApplications: string;
  myAnnouncements: string;
  myDocuments: string;
  myInvoices: string;
  tenants: string;
  sectionAdmissions: string;
  sectionDaily: string;
  sectionCommunication: string;
  sectionConfig: string;
  sectionAccount: string;
  sectionSuperAdmin: string;
};

export function navSectionsForRole(role: Role, l: Labels): NavSection[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [
        {
          title: l.sectionSuperAdmin,
          items: [{ label: l.tenants, href: "/super-admin", icon: "tenants" }],
        },
        {
          title: l.sectionAccount,
          items: [{ label: l.settings, href: "/settings", icon: "settings" }],
        },
      ];

    case "SCHOOL_ADMIN":
      return [
        {
          items: [{ label: l.dashboard, href: "/dashboard", icon: "dashboard" }],
        },
        {
          title: l.sectionAdmissions,
          items: [
            { label: l.admissions, href: "/admissions-admin", icon: "admissions" },
          ],
        },
        {
          title: l.sectionDaily,
          items: [
            { label: l.students, href: "/students", icon: "students" },
            { label: l.parents, href: "/admin/parents", icon: "parents" },
            { label: l.classes, href: "/classes", icon: "classes" },
            { label: l.billing, href: "/billing", icon: "billing" },
            { label: l.finance, href: "/finance", icon: "finance" },
            { label: l.payroll, href: "/payroll", icon: "payroll" },
            { label: l.staffRequests, href: "/payroll/requests", icon: "requests" },
            { label: l.transport, href: "/transport", icon: "transport" },
            { label: l.cantine, href: "/cantine", icon: "cantine" },
            { label: l.infirmerie, href: "/infirmerie", icon: "infirmerie" },
            { label: l.reports, href: "/reports", icon: "reports" },
          ],
        },
        {
          title: l.sectionCommunication,
          items: [
            { label: l.documents, href: "/admin/documents", icon: "documents" },
            { label: l.announcements, href: "/admin/announcements", icon: "announcements" },
            { label: l.messages, href: "/admin/messages", icon: "messages" },
          ],
        },
        {
          title: l.sectionConfig,
          items: [
            { label: l.years, href: "/admin/years", icon: "years" },
            { label: l.holidays, href: "/admin/holidays", icon: "holidays" },
            {
              label: l.inscriptionForm,
              href: "/admin/inscription-config",
              icon: "inscriptionForm",
            },
            { label: l.settings, href: "/settings", icon: "settings" },
          ],
        },
      ];

    case "TEACHER":
      return [
        {
          items: [{ label: l.dashboard, href: "/dashboard", icon: "dashboard" }],
        },
        {
          title: l.sectionDaily,
          items: [
            { label: l.students, href: "/students", icon: "students" },
            { label: l.attendance, href: "/attendance", icon: "attendance" },
            { label: l.discipline, href: "/discipline", icon: "discipline" },
          ],
        },
        {
          title: l.sectionAccount,
          items: [{ label: l.settings, href: "/settings", icon: "settings" }],
        },
      ];

    case "STAFF":
      return [
        {
          items: [{ label: l.dashboard, href: "/staff", icon: "dashboard" }],
        },
        {
          title: l.sectionAccount,
          items: [
            { label: l.myRequests, href: "/staff/requests", icon: "requests" },
            { label: l.teamApprovals, href: "/staff/approvals", icon: "approvals" },
            { label: l.myPayslips, href: "/staff/payslips", icon: "payroll" },
          ],
        },
      ];

    case "PARENT":
      return [
        {
          items: [{ label: l.dashboard, href: "/parent/dashboard", icon: "dashboard" }],
        },
        {
          title: l.sectionAccount,
          items: [
            { label: l.myApplications, href: "/parent/applications", icon: "admissions" },
            { label: l.myInvoices, href: "/parent/invoices", icon: "billing" },
            { label: l.settings, href: "/settings", icon: "settings" },
          ],
        },
        {
          title: l.sectionCommunication,
          items: [
            { label: l.myAnnouncements, href: "/parent/announcements", icon: "announcements" },
            { label: l.myDocuments, href: "/parent/documents", icon: "documents" },
            { label: l.contact, href: "/parent/contact", icon: "contact" },
          ],
        },
      ];
  }
}
