import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { requireUser, type SessionUser } from "./session";
import { unscopedDb } from "./db";
import { runWithTenant } from "./tenant-context";
import { postSignInPath } from "./post-signin-redirect";

/**
 * Fine-grained admin permissions ("qui a accès à quoi").
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
 */

export const ADMIN_MODULES = [
  "eleves",
  "facturation",
  "paie",
  "services",
  "infirmerie",
  "rapports",
  "formulaires",
  "admissions",
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

export const ACCESS_LEVELS = ["read", "write", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const LEVEL_RANK: Record<AccessLevel, number> = { read: 1, write: 2, full: 3 };

/** FR labels for the management UI + nav — single source of truth. */
export const MODULE_META: Record<
  AdminModule,
  { label: string; description: string }
> = {
  eleves: {
    label: "Élèves, parents & classes",
    description: "Fiches élèves, familles/parents, classes et effectifs.",
  },
  facturation: {
    label: "Facturation & finances",
    description: "Factures, paiements, tableau de bord financier.",
  },
  paie: {
    label: "Paie",
    description: "Employés, bulletins de paie, présences du personnel.",
  },
  services: {
    label: "Transport, cantine & collation",
    description: "Bus (aller/retour, circuits), cantine et collations.",
  },
  infirmerie: {
    label: "Infirmerie",
    description: "Données santé des élèves (PAI, vaccinations, allergies).",
  },
  rapports: {
    label: "Rapports",
    description: "Rapports et exports (effectifs, listes, statistiques).",
  },
  formulaires: {
    label: "Formulaires d'inscription",
    description:
      "Configuration des champs et formulaires (inscription / réinscription).",
  },
  admissions: {
    label: "Admissions, campagnes & années",
    description:
      "Dossiers d'admission, création de campagnes et d'années scolaires, classes par niveau.",
  },
};

export const LEVEL_META: Record<AccessLevel, { label: string }> = {
  read: { label: "Lecture" },
  write: { label: "Modification" },
  full: { label: "Accès complet" },
};

export type ModuleGrants = Partial<Record<AdminModule, AccessLevel>>;

export type AdminAccess =
  | { all: true; grants: null }
  | { all: false; grants: ModuleGrants };

export const FULL_ACCESS: AdminAccess = { all: true, grants: null };
export const NO_ACCESS: AdminAccess = { all: false, grants: {} };

/** Parse an AdminGrant.modules JSON blob — unknown modules/levels dropped. */
export function parseModuleGrants(raw: unknown): ModuleGrants {
  const out: ModuleGrants = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      (ADMIN_MODULES as readonly string[]).includes(k) &&
      typeof v === "string" &&
      (ACCESS_LEVELS as readonly string[]).includes(v)
    ) {
      out[k as AdminModule] = v as AccessLevel;
    }
  }
  return out;
}

/** The level this access holds on a module, or null. */
export function moduleLevel(
  access: AdminAccess,
  module: AdminModule,
): AccessLevel | null {
  if (access.all) return "full";
  return access.grants[module] ?? null;
}

/** True when the access covers `module` at `min` level or better. */
export function hasModule(
  access: AdminAccess,
  module: AdminModule,
  min: AccessLevel = "read",
): boolean {
  const lvl = moduleLevel(access, module);
  return lvl !== null && LEVEL_RANK[lvl] >= LEVEL_RANK[min];
}

/** True when the access covers at least one module (any level). */
export function hasAnyModule(access: AdminAccess): boolean {
  return access.all || Object.keys(access.grants).length > 0;
}

const ALWAYS_FULL: Role[] = ["SUPER_ADMIN", "SCHOOL_ADMIN"];

/**
 * Resolve a user's admin access. Uses unscopedDb so it works both inside
 * and outside a tenant context (the grant lookup is pinned to the user's
 * own tenantId + email — no cross-tenant surface).
 */
export async function getAdminAccess(
  user: Pick<SessionUser, "role" | "email" | "tenantId">,
): Promise<AdminAccess> {
  if (ALWAYS_FULL.includes(user.role)) return FULL_ACCESS;
  if (user.role === "PARENT") return NO_ACCESS;
  if (!user.tenantId || !user.email) return NO_ACCESS;
  const grant = await unscopedDb().adminGrant.findUnique({
    where: {
      tenantId_email: {
        tenantId: user.tenantId,
        email: user.email.toLowerCase(),
      },
    },
    select: { modules: true },
  });
  const grants = grant ? parseModuleGrants(grant.modules) : {};
  // TEACHER baseline: teachers keep read access to Élèves/classes (their
  // daily surface pre-dates the permission system). A grant can only RAISE
  // this, never lower it; every other module stays grant-only.
  if (user.role === "TEACHER" && !grants.eleves) grants.eleves = "read";
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
  const user = await requireUser();
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
