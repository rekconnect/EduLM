import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { parseModuleGrants } from "@/lib/permissions";
import { PermissionsManager, type GrantRow } from "./_manager";

export const dynamic = "force-dynamic";

/**
 * Permissions console (Raed 2026-09-30): the tenant admin grants school
 * personnel (any e-mail of the school's Microsoft directory) fine-grained
 * access per module — élèves, facturation, paie, transport/cantine,
 * infirmerie, rapports, formulaires, admissions — at lecture / modification
 * / accès complet. Grants are keyed by e-mail: they can be created before
 * the person's first Entra sign-in (an unknown address gets an SSO-only
 * STAFF account created on save).
 */
export default async function PermissionsPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  const t = await getTranslations("adminPermissions");

  const rows: GrantRow[] = await runWithTenant(
    { tenantId, slug: null },
    async () => {
      const grants = await unscopedDb().adminGrant.findMany({
        where: { tenantId },
        orderBy: { email: "asc" },
      });
      const users = grants.length
        ? await db.user.findMany({
            where: { email: { in: grants.map((g) => g.email) } },
            select: { email: true, name: true, role: true, status: true, staffRole: true },
          })
        : [];
      const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
      return grants.map((g) => {
        const account = byEmail.get(g.email) ?? null;
        return {
          id: g.id,
          email: g.email,
          modules: parseModuleGrants(g.modules),
          updatedAt: g.updatedAt.toISOString(),
          account: account
            ? {
                name: account.name,
                role: account.staffRole ? `${account.role} + ${account.staffRole}` : account.role,
                status: account.status,
              }
            : null,
        };
      });
    },
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <PermissionsManager rows={rows} />
    </div>
  );
}
