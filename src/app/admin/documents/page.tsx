import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
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

const AUDIENCE_KEY: Record<string, string> = {
  ALL_PARENTS: "audienceAll",
  CLASS: "audienceClass",
  ACADEMIC_YEAR: "audienceYear",
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
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("adminTitle")}
            description={t("adminLead")}
            action={
              <LinkButton href="/admin/documents/new" size="sm">
                + {t("newCta")}
              </LinkButton>
            }
          />

          <Table>
            <THead>
              <tr>
                <TH>{t("colTitle")}</TH>
                <TH>{t("colCategory")}</TH>
                <TH>{t("colAudience")}</TH>
                <TH>{t("colPublished")}</TH>
                <TH className="text-right">{t("colAck")}</TH>
              </tr>
            </THead>
            <tbody>
              {docs.length === 0 ? (
                <EmptyRow colSpan={5}>{t("empty")}</EmptyRow>
              ) : (
                docs.map((d) => {
                  const audienceLabel =
                    d.audience === "CLASS"
                      ? `${t("audienceClass")} · ${d.class?.name ?? "—"}`
                      : d.audience === "ACADEMIC_YEAR"
                        ? `${t("audienceYear")} · ${d.academicYear?.label ?? "—"}`
                        : t("audienceAll");
                  return (
                    <TR key={d.id}>
                      <TD>
                        <Link href={`/admin/documents/${d.id}`} className="font-medium hover:underline">
                          {d.title}
                        </Link>
                        {d.requiresAck ? (
                          <span className="ms-2 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                            {t("ackRequired")}
                          </span>
                        ) : null}
                      </TD>
                      <TD>{t(CATEGORY_KEY[d.category] ?? "categoryOther")}</TD>
                      <TD className="text-[color:var(--muted-fg)]">{audienceLabel}</TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {d.publishedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-right tabular-nums">{d._count.acknowledgments}</TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}
