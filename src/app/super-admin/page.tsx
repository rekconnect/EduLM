import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { requireRole } from "@/lib/session";
import { unscopedDb } from "@/lib/db";

export default async function SuperAdminPage() {
  const user = await requireRole("SUPER_ADMIN");
  const t = await getTranslations("tenants");

  const db = unscopedDb();
  try {
    const tenants = await db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        createdAt: true,
        _count: { select: { users: true, students: true } },
      },
    });

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.email} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("subtitle")}
            action={
              <LinkButton href="/super-admin/tenants/new" size="sm">
                {t("createCta")}
              </LinkButton>
            }
          />

          <Table>
            <THead>
              <tr>
                <TH>{t("colSlug")}</TH>
                <TH>{t("colName")}</TH>
                <TH>{t("colPlan")}</TH>
                <TH className="text-right">{t("colUsers")}</TH>
                <TH className="text-right">{t("colStudents")}</TH>
                <TH>{t("colCreated")}</TH>
              </tr>
            </THead>
            <tbody>
              {tenants.length === 0 ? (
                <EmptyRow colSpan={6}>{t("empty")}</EmptyRow>
              ) : (
                tenants.map((tn) => (
                  <TR key={tn.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/super-admin/tenants/${tn.slug}`} className="hover:underline">
                        {tn.slug}
                      </Link>
                    </TD>
                    <TD>{tn.name}</TD>
                    <TD>
                      <span className="inline-flex rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs">
                        {tn.plan}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{tn._count.users}</TD>
                    <TD className="text-right tabular-nums">{tn._count.students}</TD>
                    <TD className="text-[color:var(--muted-fg)]">
                      {tn.createdAt.toISOString().slice(0, 10)}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </main>
      </div>
    );
  } finally {
    await db.$disconnect();
  }
}
