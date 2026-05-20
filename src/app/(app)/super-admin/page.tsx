import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { requireRole } from "@/lib/session";
import { unscopedDb } from "@/lib/db";
import { cn } from "@/lib/utils";

const PLAN_TONE: Record<string, string> = {
  TRIAL:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  STARTER:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  GROWTH:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  CUSTOM:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
};

export default async function SuperAdminPage() {
  const user = await requireRole("SUPER_ADMIN");
  const t = await getTranslations("tenants");

  const db = unscopedDb();
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
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <PageHeader
          title={t("title")}
          description={t("subtitle")}
          action={
            <LinkButton href="/super-admin/tenants/new" size="sm" className="gap-1.5">
              <Plus className="size-4" aria-hidden />
              {t("createCta")}
            </LinkButton>
          }
        />

        {tenants.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
              <Building2 className="size-6" aria-hidden />
            </div>
            <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
              {t("empty")}
            </p>
            <div className="mt-5">
              <LinkButton
                href="/super-admin/tenants/new"
                size="sm"
                className="gap-1.5"
              >
                <Plus className="size-4" aria-hidden />
                {t("createCta")}
              </LinkButton>
            </div>
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("colSlug")}</TH>
                <TH>{t("colName")}</TH>
                <TH>{t("colPlan")}</TH>
                <TH className="text-end">{t("colUsers")}</TH>
                <TH className="text-end">{t("colStudents")}</TH>
                <TH>{t("colCreated")}</TH>
              </tr>
            </THead>
            <tbody>
              {tenants.map((tn) => (
                <TR key={tn.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/super-admin/tenants/${tn.slug}`}
                      className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                    >
                      {tn.slug}
                    </Link>
                  </TD>
                  <TD className="font-medium text-[color:var(--color-foreground)]">
                    {tn.name}
                  </TD>
                  <TD>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider",
                        PLAN_TONE[tn.plan] ?? PLAN_TONE.TRIAL,
                      )}
                    >
                      {tn.plan}
                    </span>
                  </TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                    {tn._count.users}
                  </TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                    {tn._count.students}
                  </TD>
                  <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                    {tn.createdAt.toISOString().slice(0, 10)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </main>
  );
}
