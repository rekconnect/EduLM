import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { AccountsTable, type AccountRow } from "./_table";

export const dynamic = "force-dynamic";

/**
 * Accounts & access console (Raed 2026-09-25): ONE place to manage portal
 * access for every account — profs, personnel, parents. Activate/deactivate
 * and generate temp passwords (shown once, forced change at first sign-in).
 * SCHOOL_ADMIN rows are listed view-only; staff normally sign in with
 * Microsoft, the password is their fallback.
 */
export default async function AccountsPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  const t = await getTranslations("accounts");

  // async callback matters: Prisma promises are lazy, so the query must be
  // AWAITED inside the AsyncLocalStorage scope or the tenant guard throws.
  const rows = await runWithTenant({ tenantId, slug: null }, async () =>
    db.user.findMany({
      where: { role: { in: ["SCHOOL_ADMIN", "TEACHER", "STAFF", "PARENT"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, status: true },
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card>
        <CardBody>
          <AccountsTable rows={rows as AccountRow[]} />
        </CardBody>
      </Card>
    </div>
  );
}
