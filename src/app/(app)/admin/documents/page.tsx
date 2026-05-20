import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderOpen, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const CATEGORY_KEY: Record<string, string> = {
  REGULATION: "categoryRegulation",
  CALENDAR: "categoryCalendar",
  FORM: "categoryForm",
  NEWSLETTER: "categoryNewsletter",
  OTHER: "categoryOther",
};

export default async function DocumentsAdminPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("documents");

    const docs = await db.tenantDocument.findMany({
      orderBy: { publishedAt: "desc" },
      include: {
        _count: { select: { acknowledgments: true } },
        class: { select: { name: true } },
        academicYear: { select: { label: true } },
      },
    });

    return (
        <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("adminTitle")}
            description={t("adminLead")}
            action={
              <LinkButton href="/admin/documents/new" size="sm" className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                {t("newCta")}
              </LinkButton>
            }
          />

          {docs.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <FolderOpen className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("empty")}
              </p>
              <div className="mt-5">
                <LinkButton href="/admin/documents/new" size="sm" className="gap-1.5">
                  <Plus className="size-4" aria-hidden />
                  {t("newCta")}
                </LinkButton>
              </div>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("colTitle")}</TH>
                  <TH>{t("colCategory")}</TH>
                  <TH>{t("colAudience")}</TH>
                  <TH>{t("colPublished")}</TH>
                  <TH className="text-end">{t("colAck")}</TH>
                </tr>
              </THead>
              <tbody>
                {docs.map((d) => {
                  const audienceLabel =
                    d.audience === "CLASS"
                      ? `${t("audienceClass")} · ${d.class?.name ?? "—"}`
                      : d.audience === "ACADEMIC_YEAR"
                        ? `${t("audienceYear")} · ${d.academicYear?.label ?? "—"}`
                        : t("audienceAll");
                  return (
                    <TR key={d.id}>
                      <TD>
                        <Link
                          href={`/admin/documents/${d.id}`}
                          className="inline-flex items-center gap-2 font-medium text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                        >
                          {d.title}
                          {d.requiresAck ? (
                            <span className="inline-flex rounded-full bg-[color:var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-warning-soft-fg)]">
                              {t("ackRequired")}
                            </span>
                          ) : null}
                        </Link>
                      </TD>
                      <TD className="text-[color:var(--color-foreground)]">
                        {t(CATEGORY_KEY[d.category] ?? "categoryOther")}
                      </TD>
                      <TD className="text-[color:var(--color-foreground-muted)]">
                        {audienceLabel}
                      </TD>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {d.publishedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-end tabular-nums">
                        {d._count.acknowledgments > 0 ? (
                          <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-700)]">
                            {d._count.acknowledgments}
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-foreground-subtle)]">
                            0
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </main>
    );
  });
}
