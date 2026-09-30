import { getTranslations } from "next-intl/server";
import { CheckCircle2, Globe2, Megaphone, Plus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { db } from "@/lib/db";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { describeAudience } from "@/lib/messaging";
import { parseAudienceSpec, type AudienceSpec } from "@/lib/messaging-shared";

/** describeAudience runs up to 2 queries — label unique specs a few at a time. */
const LABEL_CONCURRENCY = 5;

export default async function AnnouncementsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string }>;
}) {
  const { user, access } = await requireModuleAccess("communication", "read");
  const canWrite = hasModule(access, "communication", "write");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const sp = await searchParams;
  const publishedCount = Number.parseInt(sp.published ?? "", 10);
  const justPublished = Number.isFinite(publishedCount) && publishedCount > 0;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");
    const tA = await getTranslations("messaging.annonces");

    const announcements = await db.announcement.findMany({
      orderBy: { publishedAt: "desc" },
      include: {
        class: { select: { name: true } },
        academicYear: { select: { label: true } },
        _count: { select: { reads: true } },
      },
    });

    // Rows with a flexible audience → describeAudience, memoised per spec
    // (most announcements share a handful of audiences).
    const specByKey = new Map<string, AudienceSpec>();
    const keyById = new Map<string, string>();
    for (const a of announcements) {
      if (a.audienceSpec === null) continue;
      const spec = parseAudienceSpec(a.audienceSpec);
      const key = JSON.stringify(spec);
      specByKey.set(key, spec);
      keyById.set(a.id, key);
    }
    const labelByKey = new Map<string, string>();
    const pending = [...specByKey.entries()];
    for (let i = 0; i < pending.length; i += LABEL_CONCURRENCY) {
      const chunk = pending.slice(i, i + LABEL_CONCURRENCY);
      const labels = await Promise.all(chunk.map(([, spec]) => describeAudience(spec)));
      chunk.forEach(([key], j) => labelByKey.set(key, labels[j] ?? "—"));
    }

    return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("announcementsTitle")}
            description={t("announcementsAdminLead")}
            action={
              canWrite ? (
                <LinkButton
                  href="/admin/announcements/new"
                  size="sm"
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden />
                  {t("newAnnouncementCta")}
                </LinkButton>
              ) : undefined
            }
          />

          {justPublished ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-[color:var(--color-success)]/30 bg-[color:var(--color-success-soft)] px-4 py-3 text-sm text-[color:var(--color-success-soft-fg)]"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">
                <span className="font-medium">{tA("publishedTitle")}</span>{" "}
                {tA("publishedDetail", { count: publishedCount })}
              </p>
              <a
                href="/admin/announcements"
                aria-label={tA("dismiss")}
                className="-m-1 rounded-md p-1 opacity-70 transition-opacity duration-150 ease-out hover:opacity-100"
              >
                <X className="size-4" aria-hidden />
              </a>
            </div>
          ) : null}

          {announcements.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Megaphone className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("emptyAnnouncements")}
              </p>
              {canWrite ? (
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
              ) : null}
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
                  const specKey = keyById.get(a.id);
                  const wholeSchool = specKey
                    ? specByKey.get(specKey)?.all === true
                    : a.audience === "ALL_PARENTS";
                  const audienceLabel = specKey
                    ? (labelByKey.get(specKey) ?? "—")
                    : a.audience === "CLASS"
                      ? `${t("audienceClass")} · ${a.class?.name ?? "—"}`
                      : a.audience === "ACADEMIC_YEAR"
                        ? `${t("audienceYear")} · ${a.academicYear?.label ?? "—"}`
                        : t("audienceAll");
                  const AudienceIcon = wholeSchool ? Globe2 : Users;
                  return (
                    <TR key={a.id}>
                      <TD className="font-medium text-[color:var(--color-foreground)]">
                        {a.title}
                      </TD>
                      <TD className="text-[color:var(--color-foreground-muted)]">
                        <span className="inline-flex max-w-[22rem] items-start gap-1.5">
                          <AudienceIcon
                            className="mt-0.5 size-3.5 shrink-0 text-[color:var(--color-foreground-subtle)]"
                            aria-hidden
                          />
                          <span className="min-w-0 break-words">{audienceLabel}</span>
                        </span>
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
