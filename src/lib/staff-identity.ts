import { unscopedDb } from "./db";

/**
 * Shared rules for the "double profil" (a PARENT account that is also school
 * personnel) and for anything that turns a parent account into a staff
 * identity. Used by the permissions console, the accounts console, the
 * parents console, sign-up, Microsoft sign-in and the staff import.
 */

/** Row fields needed to judge whether a PARENT account is provably its owner's. */
export type ProvenanceRow = {
  darsParentId: number | null;
  passwordHash: string | null;
  guardianProfile: { _count: { childLinks: number } } | null;
  /** Microsoft (Entra) Account rows, if any. */
  accounts: { id: string }[];
};

export const PROVENANCE_SELECT = {
  darsParentId: true,
  passwordHash: true,
  guardianProfile: { select: { _count: { select: { childLinks: true } } } },
  accounts: { where: { provider: "microsoft-entra-id" }, select: { id: true }, take: 1 },
} as const;

/**
 * A PARENT account may receive a staff hat only when it is provably the
 * person's own: imported from Dars, linked to a child by the school, or
 * signed in with the school's Microsoft directory AND password-less (an
 * SSO-only account can't be shared with whoever self-registered it).
 * /sign-up is public, so a staff address could otherwise be squatted as a
 * "parent" and later handed staff access.
 */
export function hasProvenance(row: ProvenanceRow): boolean {
  if (row.darsParentId !== null) return true;
  if ((row.guardianProfile?._count.childLinks ?? 0) > 0) return true;
  return row.accounts.length > 0 && row.passwordHash === null;
}

/** Normalize a configured staff domain ("@Lycee.Edu " → "lycee.edu"). */
export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^@+/, "");
}

/** True when the address belongs to one of the tenant's staff domains. */
export function isStaffDomainEmail(email: string, domains: string[]): boolean {
  const e = email.trim().toLowerCase();
  return domains.map(normalizeDomain).some((d) => d && e.endsWith("@" + d));
}

/** The tenant's staff domains (normalized). */
export async function staffDomainsFor(tenantId: string): Promise<string[]> {
  const t = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { staffEmailDomains: true },
  });
  return (t?.staffEmailDomains ?? []).map(normalizeDomain).filter(Boolean);
}

/** Microsoft sign-in is configured — the only case where dropping a password
 *  leaves the person a way in. Mirrors src/lib/auth.ts microsoftSignInEnabled
 *  without importing the whole auth module into server actions. */
export function microsoftSsoConfigured(): boolean {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim() ?? "";
  return Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
      /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0\/?$/i.test(issuer) &&
      !/\/(common|organizations|consumers)\/v2\.0\/?$/i.test(issuer),
  );
}

/** Grants are keyed by e-mail: keep them attached when an account is re-mailed. */
export async function moveAdminGrantEmail(
  tenantId: string,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const from = oldEmail.trim().toLowerCase();
  const to = newEmail.trim().toLowerCase();
  if (!from || !to || from === to) return;
  await unscopedDb().adminGrant.updateMany({
    where: { tenantId, email: from },
    data: { email: to },
  });
}

/** Drop every grant held by an e-mail (account permanently deleted). */
export async function deleteAdminGrantsForEmail(tenantId: string, email: string): Promise<void> {
  await unscopedDb().adminGrant.deleteMany({
    where: { tenantId, email: email.trim().toLowerCase() },
  });
}

/**
 * Parents-console guard: a parent account wearing a staff hat is a STAFF
 * identity. Resetting its password, disabling, deleting or re-mailing it from
 * the Parents console would take over / kill a staff login, so those actions
 * are reserved to SCHOOL_ADMIN — everyone else only reaches plain parents.
 */
export function hatGuard(user: { role: string }): { staffRole?: null } {
  return user.role === "SCHOOL_ADMIN" ? {} : { staffRole: null };
}

/**
 * Stronger form for Prisma `where`: for non-admins, exclude parent accounts
 * that are a staff identity — those wearing a hat AND those on a staff
 * e-mail domain (a hatless staff-domain parent is still the teacher's own
 * login once Microsoft has linked it; resetting its password from the
 * Parents console would hand that login to whoever holds eleves:write).
 */
export async function staffIdentityGuard(
  user: { role: string },
  tenantId: string,
): Promise<Record<string, unknown>> {
  if (user.role === "SCHOOL_ADMIN") return {};
  const domains = await staffDomainsFor(tenantId);
  return {
    staffRole: null,
    ...(domains.length
      ? {
          NOT: {
            OR: domains.map((d) => ({
              email: { endsWith: "@" + d, mode: "insensitive" as const },
            })),
          },
        }
      : {}),
  };
}
