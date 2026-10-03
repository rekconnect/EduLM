import { cache } from "react";
import { redirect } from "next/navigation";
import type { PayrollEmployee, Role, StaffRole } from "@prisma/client";
import { auth } from "./auth";
import { db, unscopedDb } from "./db";
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
  /** Sign-in instant (ms since epoch), null for legacy tokens. */
  issuedAt: number | null;
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
    issuedAt: session.user.issuedAt ?? null,
  };
}

export type StaffCapability = "SCHOOL_ADMIN" | "TEACHER" | "STAFF";

/**
 * Double profil: a PARENT account that is also school personnel carries a
 * secondary `staffRole` (User.staffRole). Resolved from the DB per request —
 * memoized with React cache so a page + its actions pay one indexed lookup —
 * never from the JWT, so granting/removing a hat needs no re-login.
 */
type LiveUser = {
  role: Role;
  email: string;
  status: string;
  deletedAt: Date | null;
  staffRole: StaffRole | null;
  sessionsInvalidBefore: Date | null;
};

/**
 * The account as it is in the DB right now (role, status, hat) — one indexed
 * lookup per request (React cache). The JWT is only trusted for identity:
 * a disabled, deleted or demoted account loses access on its next request,
 * not when its 30-day token expires.
 */
const liveUserById = cache(async (userId: string): Promise<LiveUser | null> =>
  unscopedDb().user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      email: true,
      status: true,
      deletedAt: true,
      staffRole: true,
      sessionsInvalidBefore: true,
    },
  }),
);

/** Exists, not deleted/disabled, and the token predates no revocation. */
function isLive(u: LiveUser | null, issuedAt: number | null): u is LiveUser {
  if (!u || u.deletedAt || u.status === "DISABLED") return false;
  if (u.sessionsInvalidBefore) {
    // A token without our sign-in stamp (legacy) counts as older than any
    // revocation. Strict "<": the token minted by the very sign-in that set
    // the revocation (same ms at worst) stays valid.
    if (issuedAt === null) return false;
    if (issuedAt < u.sessionsInvalidBefore.getTime()) return false;
  }
  return true;
}

/**
 * The account as the DB sees it, or null when the session must no longer be
 * honoured (disabled, deleted, or revoked after a password strip/reset).
 * Shared by every guard so a stale JWT never outlives its credentials.
 */
export async function liveAccount(
  user: Pick<SessionUser, "id" | "issuedAt">,
): Promise<LiveUser | null> {
  const live = await liveUserById(user.id);
  return isLive(live, user.issuedAt) ? live : null;
}

export const ACCOUNT_DISABLED_PATH = "/sign-in?error=AccountDisabled";

/** requireUser + liveness: for role-agnostic reads that must still refuse a
 *  disabled / deleted / revoked token. Returns the LIVE role and e-mail. */
export async function requireLiveUser(): Promise<SessionUser> {
  const jwtUser = await requireUser();
  const live = await liveAccount(jwtUser);
  if (!live) redirect(ACCOUNT_DISABLED_PATH);
  return { ...jwtUser, role: live.role, email: live.email };
}

/**
 * The staff capability a user acts with: their DB role for staff roles, the
 * staff hat for a PARENT who is also personnel, null for everyone else and
 * for any disabled / deleted account.
 */
export async function effectiveStaffRole(
  user: Pick<SessionUser, "id" | "role" | "issuedAt">,
): Promise<StaffCapability | null> {
  const live = await liveAccount(user);
  if (!live) return null;
  if (live.role === "SCHOOL_ADMIN" || live.role === "TEACHER" || live.role === "STAFF") {
    return live.role;
  }
  if (live.role === "PARENT") return live.staffRole ?? null;
  return null;
}

/**
 * Require a specific role (or one of several). Redirects mismatched roles to
 * their own home so the URL bar never reveals a 403. A PARENT with a staff
 * hat passes a TEACHER/STAFF check (double profil); the reverse never holds.
 */
export async function requireRole(
  allowed: Role | Role[],
): Promise<SessionUser> {
  const jwtUser = await requireUser();
  const live = await liveAccount(jwtUser);
  // Disabled / deleted / revoked since sign-in → out, now.
  if (!live) redirect(ACCOUNT_DISABLED_PATH);
  const user = { ...jwtUser, role: live.role, email: live.email };
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (list.includes(user.role)) return user;
  if (user.role === "PARENT" && live.staffRole && list.includes(live.staffRole)) {
    return user;
  }
  redirect(postSignInPath(user.role));
}

/**
 * Require a tenant-bound user (anyone except SUPER_ADMIN). Returns the user
 * with a non-null `tenantId` and runs the rest of the request inside an
 * AsyncLocalStorage so Prisma queries are auto-scoped to this tenant.
 */
export async function withTenantSession<T>(
  fn: (user: SessionUser & { tenantId: string }) => Promise<T>,
): Promise<T> {
  const jwtUser = await requireUser();
  // Not live → sign-in (never the role home: that page would send us back).
  const live = await liveAccount(jwtUser);
  if (!live) redirect(ACCOUNT_DISABLED_PATH);
  // Act on the LIVE role/e-mail (an account re-roled since sign-in must not
  // bounce between /dashboard and itself on its stale JWT role).
  const user = { ...jwtUser, role: live.role, email: live.email };
  const eff = await effectiveStaffRole(user);
  if (!eff || !ADMIN_APP_ROLES.includes(eff)) redirect(postSignInPath(user.role));
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
