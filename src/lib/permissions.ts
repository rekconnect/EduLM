import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  ACCOUNT_DISABLED_PATH,
  effectiveStaffRole,
  liveAccount,
  requireUser,
  type SessionUser,
} from "./session";
import { unscopedDb } from "./db";
import { runWithTenant } from "./tenant-context";
import { postSignInPath } from "./post-signin-redirect";
import {
  FULL_ACCESS,
  NO_ACCESS,
  hasModule,
  parseModuleGrants,
  type AccessLevel,
  type AdminAccess,
  type AdminModule,
} from "./permissions-shared";

/**
 * Fine-grained admin permissions ("qui a accès à quoi") — SERVER half.
 *
 * Model: SCHOOL_ADMIN and SUPER_ADMIN always have FULL access to every
 * module — grants never apply to them. Everyone else (TEACHER, STAFF)
 * reaches an admin module only through an AdminGrant row, keyed by their
 * school e-mail (so the IT manager can grant access BEFORE the person's
 * first Microsoft sign-in — resolution happens by e-mail match at session
 * time). PARENT accounts can never hold admin access.
 *
 * Levels: read < write < full.
 *   - read  : consult the module's pages.
 *   - write : create / modify records inside the module.
 *   - full  : write + destructive or structural actions (delete, config,
 *             exports, campaign/year creation…).
 *
 * Constants, types and predicates live in ./permissions-shared (client-safe,
 * no server imports) and are re-exported here so server code has one import.
 */
export * from "./permissions-shared";

const ALWAYS_FULL: Role[] = ["SUPER_ADMIN", "SCHOOL_ADMIN"];

/**
 * Resolve a user's admin access. Uses unscopedDb so it works both inside
 * and outside a tenant context (the grant lookup is pinned to the user's
 * own tenantId + email — no cross-tenant surface).
 */
export async function getAdminAccess(
  user: Pick<SessionUser, "id" | "role" | "email" | "tenantId" | "issuedAt">,
): Promise<AdminAccess> {
  // Everything below is decided on the LIVE account, never the JWT: a
  // disabled/deleted/demoted admin loses FULL access on the next request,
  // and grants follow the account's current e-mail.
  const live = await liveAccount(user);
  if (!live) return NO_ACCESS;
  if (ALWAYS_FULL.includes(live.role)) return FULL_ACCESS;
  if (!user.tenantId) return NO_ACCESS;
  // TEACHER/STAFF by role, or a PARENT wearing a staff hat (double profil).
  // A plain parent has no staff capability → never any module access.
  const eff = await effectiveStaffRole(user);
  if (!eff) return NO_ACCESS;
  const grant = await unscopedDb().adminGrant.findUnique({
    where: {
      tenantId_email: {
        tenantId: user.tenantId,
        email: live.email.toLowerCase(),
      },
    },
    select: { modules: true },
  });
  const grants = grant ? parseModuleGrants(grant.modules) : {};
  // TEACHER baseline: teachers keep read access to Élèves/classes (their
  // daily surface pre-dates the permission system). A grant can only RAISE
  // this, never lower it; every other module stays grant-only.
  if (eff === "TEACHER" && !grants.eleves) grants.eleves = "read";
  if (Object.keys(grants).length === 0) return NO_ACCESS;
  return { all: false, grants };
}

export type ModuleSessionUser = SessionUser & { tenantId: string };

/**
 * Page/action guard: require `module` access at `min` level. SCHOOL_ADMIN
 * and SUPER_ADMIN always pass; TEACHER/STAFF pass via their AdminGrant;
 * everyone else is redirected to their own home (no 403 in the URL bar,
 * same convention as requireRole). Does NOT open a tenant context — pages
 * keep their own runWithTenant, exactly like requireRole callers do.
 */
export async function requireModuleAccess(
  module: AdminModule,
  min: AccessLevel = "read",
): Promise<{ user: ModuleSessionUser; access: AdminAccess }> {
  const jwtUser = await requireUser();
  const live = await liveAccount(jwtUser);
  if (!live) redirect(ACCOUNT_DISABLED_PATH);
  // Pages read user.role for in-page admin checks: hand them the LIVE role.
  const user = { ...jwtUser, role: live.role, email: live.email };
  if (!user.tenantId) redirect("/sign-in");
  const access = await getAdminAccess(user);
  if (!hasModule(access, module, min)) redirect(postSignInPath(user.role));
  return { user: user as ModuleSessionUser, access };
}

/**
 * withTenantSession-style wrapper for pages built on that pattern: checks
 * the module access, then runs `fn` inside the tenant scope.
 */
export async function withModuleSession<T>(
  module: AdminModule,
  min: AccessLevel,
  fn: (user: ModuleSessionUser, access: AdminAccess) => Promise<T>,
): Promise<T> {
  const { user, access } = await requireModuleAccess(module, min);
  return runWithTenant({ tenantId: user.tenantId, slug: null }, () =>
    fn(user, access),
  );
}
