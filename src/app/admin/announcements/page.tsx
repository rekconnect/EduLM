import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

export default async function AnnouncementsAdminPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");

    const announcements = await db.announcement.findMany({
      orderBy: { publishedAt: "desc" },
      include: {
        class: { select: { name: true } },
        academicYear: { select: { label: true } },
        _count: { select: { reads: true } },
      },
    });

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("announcementsTitle")}
            description={t("announcementsAdminLead")}
            action={
              <LinkButton href="/admin/announcements/new" size="sm">
                + {t("newAnnouncementCta")}
              </LinkButton>
            }
          />

          <Table>
            <THead>
              <tr>
                <TH>{t("colTitle")}</TH>
                <TH>{t("colAudience")}</TH>
                <TH>{t("colPublished")}</TH>
                <TH className="text-right">{t("colReads")}</TH>
              </tr>
            </THead>
            <tbody>
              {announcements.length === 0 ? (
                <EmptyRow colSpan={4}>{t("emptyAnnouncements")}</EmptyRow>
              ) : (
                announcements.map((a) => {
                  const audienceLabel =
                    a.audience === "CLASS"
                      ? `${t("audienceClass")} · ${a.class?.name ?? "—"}`
                      : a.audience === "ACADEMIC_YEAR"
                        ? `${t("audienceYear")} · ${a.academicYear?.label ?? "—"}`
                        : t("audienceAll");
                  return (
                    <TR key={a.id}>
                      <TD className="font-medium">{a.title}</TD>
                      <TD className="text-[color:var(--muted-fg)]">{audienceLabel}</TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {a.publishedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-right tabular-nums">{a._count.reads}</TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </div>
    );
  });
}
