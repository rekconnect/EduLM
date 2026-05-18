import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "./auth";
import { db } from "./db";
import { runWithTenant } from "./tenant-context";
import { postSignInPath } from "./post-signin-redirect";

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
  if (user.role === "SUPER_ADMIN") redirect("/super-admin");
  if (!user.tenantId) redirect("/sign-in");
  const bound = user as SessionUser & { tenantId: string };
  return runWithTenant({ tenantId: bound.tenantId, slug: null }, () => fn(bound));
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
