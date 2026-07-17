import { redirect } from "next/navigation";
import type { PayrollEmployee, Role } from "@prisma/client";
import { auth } from "./auth";
import { db } from "./db";
import { runWithTenant } from "./tenant-context";
import { postSignInPath } from "./post-signin-redirect";

// Roles allowed inside the staff-facing admin app (the (app) pages guarded by
// withTenantSession). PARENT and STAFF have their own portals and must be
// bounced to them — otherwise they could read the full admin surface
// (students, medical, discipline…) since those pages carry no per-page role
// check of their own.
const ADMIN_APP_ROLES: Role[] = ["SCHOOL_ADMIN", "TEACHER"];

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  tenantId: string | null;
  locale: string | null;
};

/**
 * Require any authenticated user. Redirects to `/sign-in` otherwise.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: session.user.role,
    tenantId: session.user.tenantId,
    locale: session.user.locale,
  };
}

/**
 * Require a specific role (or one of several). Redirects mismatched roles to
 * their own home so the URL bar never reveals a 403.
 */
export async function requireRole(
  allowed: Role | Role[],
): Promise<SessionUser> {
  const user = await requireUser();
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(user.role)) redirect(postSignInPath(user.role));
  return user;
}

/**
 * Require a tenant-bound user (anyone except SUPER_ADMIN). Returns the user
 * with a non-null `tenantId` and runs the rest of the request inside an
 * AsyncLocalStorage so Prisma queries are auto-scoped to this tenant.
 */
export async function withTenantSession<T>(
  fn: (user: SessionUser & { tenantId: string }) => Promise<T>,
): Promise<T> {
  const user = await requireUser();
  if (!ADMIN_APP_ROLES.includes(user.role)) redirect(postSignInPath(user.role));
  if (!user.tenantId) redirect("/sign-in");
  const bound = user as SessionUser & { tenantId: string };
  return runWithTenant({ tenantId: bound.tenantId, slug: null }, () => fn(bound));
}

/**
 * Require a staff-side user (STAFF/TEACHER/SCHOOL_ADMIN), resolve their
 * PayrollEmployee record, and run inside the tenant scope. The employee is
 * matched by claimed userId first, then by email (claimed lazily on first
 * visit so records linked by the admin before the user ever signed in still
 * attach). `employee` is null when no record matches — pages show a friendly
 * "not linked yet" state.
 */
export async function withStaffSession<T>(
  fn: (
    user: SessionUser & { tenantId: string },
    employee: PayrollEmployee | null,
  ) => Promise<T>,
): Promise<T> {
  const user = await requireRole(["STAFF", "TEACHER", "SCHOOL_ADMIN"]);
  if (!user.tenantId) redirect("/sign-in");
  const bound = user as SessionUser & { tenantId: string };
  return runWithTenant({ tenantId: bound.tenantId, slug: null }, async () => {
    let employee = await db.payrollEmployee.findFirst({ where: { userId: bound.id } });
    if (!employee && bound.email) {
      const unclaimed = await db.payrollEmployee.findFirst({
        where: { email: { equals: bound.email, mode: "insensitive" }, userId: null },
      });
      if (unclaimed) {
        employee = await db.payrollEmployee.update({
          where: { id: unclaimed.id },
          data: { userId: bound.id },
        });
      }
    }
    return fn(bound, employee);
  });
}

/**
 * Require a PARENT user, resolve their Guardian row + list of childIds, and
 * run inside the tenant scope. Used by all parent-portal pages so they can
 * safely query `where: { studentId: { in: childIds } }` without leaking other
 * families' data.
 */
export async function withParentSession<T>(
  fn: (
    user: SessionUser & { tenantId: string },
    childIds: string[],
  ) => Promise<T>,
): Promise<T> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) redirect("/sign-in");
  const bound = user as SessionUser & { tenantId: string };
  return runWithTenant({ tenantId, slug: null }, async () => {
    const guardian = await db.guardian.findUnique({
      where: { userId: bound.id },
      select: { id: true, childLinks: { select: { studentId: true } } },
    });
    const childIds = guardian?.childLinks.map((l) => l.studentId) ?? [];
    return fn(bound, childIds);
  });
}
