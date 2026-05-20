import { getTranslations } from "next-intl/server";
import { Megaphone, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
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
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("announcementsTitle")}
            description={t("announcementsAdminLead")}
            action={
              <LinkButton
                href="/admin/announcements/new"
                size="sm"
                className="gap-1.5"
              >
                <Plus className="size-4" aria-hidden />
                {t("newAnnouncementCta")}
              </LinkButton>
            }
          />

          {announcements.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Megaphone className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("emptyAnnouncements")}
              </p>
              <div className="mt-5">
                <LinkButton
                  href="/admin/announcements/new"
                  size="sm"
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden />
                  {t("newAnnouncementCta")}
                </LinkButton>
              </div>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("colTitle")}</TH>
                  <TH>{t("colAudience")}</TH>
                  <TH>{t("colPublished")}</TH>
                  <TH className="text-end">{t("colReads")}</TH>
                </tr>
              </THead>
              <tbody>
                {announcements.map((a) => {
                  const audienceLabel =
                    a.audience === "CLASS"
                      ? `${t("audienceClass")} · ${a.class?.name ?? "—"}`
                      : a.audience === "ACADEMIC_YEAR"
                        ? `${t("audienceYear")} · ${a.academicYear?.label ?? "—"}`
                        : t("audienceAll");
                  return (
                    <TR key={a.id}>
                      <TD className="font-medium text-[color:var(--color-foreground)]">
                        {a.title}
                      </TD>
                      <TD className="text-[color:var(--color-foreground-muted)]">
                        {audienceLabel}
                      </TD>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {a.publishedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-end tabular-nums">
                        {a._count.reads > 0 ? (
                          <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-700)]">
                            {a._count.reads}
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
