import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  MessageSquareReply,
  Paperclip,
  Users,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FilterPill } from "@/components/ui/filter-pill";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { parentDisplayName } from "@/lib/messaging";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { getSignedDownloadUrl } from "@/lib/storage";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { DeleteBroadcastButton } from "./_delete";

/**
 * One school send (MessageBroadcast): content, read / reply stats and the
 * per-parent recipient list (its fanned-out threads).
 */

const RECIPIENT_CAP = 500;

const SHOWS = ["all", "unread", "read", "replied"] as const;
type Show = (typeof SHOWS)[number];

const SHOW_WHERE: Record<Show, Prisma.MessageThreadWhereInput> = {
  all: {},
  unread: { parentReadAt: null },
  read: { parentReadAt: { not: null } },
  replied: { posts: { some: { fromSchool: false } } },
};

export default async function SentMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { id } = await params;
  const { show } = await searchParams;
  const currentShow: Show = (SHOWS as readonly string[]).includes(show ?? "")
    ? (show as Show)
    : "all";
  const { user, access } = await requireModuleAccess("communication", "read");
  const canDelete = hasModule(access, "communication", "full");

  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const [t, locale, tenant, b] = await Promise.all([
      getTranslations("messaging.sent"),
      getLocale(),
      db.tenant.findUnique({ where: { id: user.tenantId }, select: { timeZone: true } }),
      db.messageBroadcast.findFirst({
        where: { id },
        select: {
          id: true,
          subject: true,
          body: true,
          audienceLabel: true,
          allowReplies: true,
          recipientCount: true,
          createdAt: true,
          sender: { select: { name: true, firstName: true, lastName: true, email: true } },
          attachments: {
            orderBy: { createdAt: "asc" },
            select: { id: true, fileName: true, sizeBytes: true, storagePath: true },
          },
        },
      }),
    ]);
    if (!b) notFound();

    const [counts, threads, attachments] = await Promise.all([
      Promise.all(
        SHOWS.map((s) =>
          db.messageThread.count({ where: { broadcastId: b.id, ...SHOW_WHERE[s] } }),
        ),
      ),
      db.messageThread.findMany({
        where: { broadcastId: b.id, ...SHOW_WHERE[currentShow] },
        orderBy: [{ parent: { lastName: "asc" } }, { parent: { firstName: "asc" } }],
        take: RECIPIENT_CAP,
        select: {
          id: true,
          parentReadAt: true,
          schoolUnread: true,
          parent: {
            select: {
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
              guardianProfile: {
                select: {
                  childLinks: { select: { student: { select: { firstName: true } } } },
                },
              },
            },
          },
          posts: {
            where: { fromSchool: false },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      // Signed links only after the broadcast was found in this tenant.
      Promise.all(
        b.attachments.map(async (a) => ({
          id: a.id,
          fileName: a.fileName,
          sizeBytes: a.sizeBytes,
          url: await getSignedDownloadUrl(a.storagePath),
        })),
      ),
    ]);
    const countOf = Object.fromEntries(SHOWS.map((s, i) => [s, counts[i]])) as Record<
      Show,
      number
    >;

    const fmt = dateFormatters(locale, tenant?.timeZone);
    const recipients = b.recipientCount;
    const read = countOf.read;
    const unread = countOf.unread;
    const replied = countOf.replied;
    const readPct = pct(read, recipients);
    const senderName = parentDisplayName(b.sender);
    const selfHref = `/admin/messages/sent/${b.id}`;

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-3">
          <Link
            href="/admin/messages?tab=sent"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:text-[color:var(--color-foreground)]"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("back")}
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
                {b.subject}
              </h1>
              <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
                {t("sentByOn", { name: senderName, date: fmt.stamp(b.createdAt) })}
              </p>
            </div>
            {canDelete ? (
              <DeleteBroadcastButton
                broadcastId={b.id}
                recipientCount={recipients}
                repliedCount={replied}
              />
            ) : null}
          </div>
        </div>

        {/* ── Stats ─────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<Users className="size-4" aria-hidden />}
            tone="bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]"
            label={t("statRecipients")}
            value={recipients}
            hint={t("statRecipientsHint")}
          />
          <StatTile
            icon={<Eye className="size-4" aria-hidden />}
            tone="bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
            label={t("statRead")}
            value={read}
            hint={t("statPct", { pct: readPct })}
            progress={readPct}
          />
          <StatTile
            icon={<EyeOff className="size-4" aria-hidden />}
            tone="bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]"
            label={t("statUnread")}
            value={unread}
            hint={t("statPct", { pct: pct(unread, recipients) })}
          />
          <StatTile
            icon={<MessageSquareReply className="size-4" aria-hidden />}
            tone="bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]"
            label={t("statReplies")}
            value={replied}
            hint={b.allowReplies ? t("statPct", { pct: pct(replied, recipients) }) : t("repliesOff")}
          />
        </div>

        {/* ── Message ───────────────────────────────────── */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="min-w-0">
            <CardHeader title={t("messageTitle")} />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[color:var(--color-foreground)]">
                {b.body}
              </p>
              {attachments.length ? (
                <div className="border-t border-[color:var(--color-border-subtle)] pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--color-foreground-subtle)]">
                    {t("attachmentsLabel", { count: attachments.length })}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {attachments.map((a) => (
                      <li key={a.id}>
                        {a.url ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:border-[color:var(--color-brand-500)]/40 hover:text-[color:var(--color-brand-600)]"
                          >
                            <Paperclip className="size-3.5 shrink-0" aria-hidden />
                            <span className="max-w-[240px] truncate">{a.fileName}</span>
                            <span className="shrink-0 text-[color:var(--color-foreground-subtle)]">
                              {formatBytes(a.sizeBytes, locale)}
                            </span>
                          </a>
                        ) : (
                          <span
                            title={t("attachmentUnavailable")}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-[color:var(--color-border-strong)] px-2.5 py-1.5 text-xs text-[color:var(--color-foreground-subtle)]"
                          >
                            <Paperclip className="size-3.5 shrink-0" aria-hidden />
                            <span className="max-w-[240px] truncate">{a.fileName}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[color:var(--color-foreground-muted)]">
                    {t("detailAudience")}
                  </dt>
                  <dd className="mt-0.5 text-[color:var(--color-foreground)]">
                    {b.audienceLabel || "—"}
                  </dd>
                </div>
                <DetailRow label={t("detailReplies")}>
                  {b.allowReplies ? (
                    <span className="inline-flex items-center rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success-soft-fg)]">
                      {t("repliesOn")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-foreground-muted)]">
                      {t("repliesOff")}
                    </span>
                  )}
                </DetailRow>
                <DetailRow label={t("detailSentAt")}>
                  <time dateTime={b.createdAt.toISOString()} title={fmt.full(b.createdAt)}>
                    {fmt.stamp(b.createdAt)}
                  </time>
                </DetailRow>
                <DetailRow label={t("detailSender")}>{senderName}</DetailRow>
              </dl>
            </CardBody>
          </Card>
        </div>

        {/* ── Recipients ────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
              {t("recipientsTitle")}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {SHOWS.map((s) => (
                <FilterPill
                  key={s}
                  href={s === "all" ? selfHref : `${selfHref}?show=${s}`}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      {t(`show_${s}`)}
                      <span className="tabular-nums opacity-80">{countOf[s]}</span>
                    </span>
                  }
                  active={currentShow === s}
                />
              ))}
            </div>
          </div>

          <Table>
            <THead>
              <tr>
                <TH className="text-start">{t("colParent")}</TH>
                <TH className="whitespace-nowrap text-start">{t("colReadAt")}</TH>
                <TH className="whitespace-nowrap text-start">{t("colReplied")}</TH>
                <TH className="w-[1%]">
                  <span className="sr-only">{t("openConversationCol")}</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {threads.length === 0 ? (
                <EmptyRow colSpan={4}>{t(`recipientsEmpty_${currentShow}`)}</EmptyRow>
              ) : (
                threads.map((th) => {
                  const name = parentDisplayName(th.parent);
                  const kids = [
                    ...new Set(
                      (th.parent.guardianProfile?.childLinks ?? [])
                        .map((l) => l.student.firstName?.trim())
                        .filter((n): n is string => !!n),
                    ),
                  ];
                  const lastReply = th.posts[0];
                  const threadHref = `/admin/messages/${th.id}`;
                  return (
                    <TR key={th.id}>
                      <TD className="min-w-[200px]">
                        <p className="font-medium text-[color:var(--color-foreground)]">
                          {name}
                          {th.parent.status === "DISABLED" ? (
                            <span
                              className="ms-2 inline-flex items-center rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 align-middle text-[10px] font-medium text-[color:var(--color-foreground-muted)]"
                              title={t("inactiveAccountHint")}
                            >
                              {t("inactiveAccount")}
                            </span>
                          ) : null}
                        </p>
                        {kids.length ? (
                          <p className="mt-0.5 text-xs text-[color:var(--color-foreground-subtle)]">
                            {t("childrenOf", { names: kids.join(", ") })}
                          </p>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {th.parentReadAt ? (
                          <time
                            dateTime={th.parentReadAt.toISOString()}
                            title={fmt.full(th.parentReadAt)}
                            className="text-[color:var(--color-foreground-muted)]"
                          >
                            {fmt.stamp(th.parentReadAt)}
                          </time>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[color:var(--color-warning-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-warning-soft-fg)]">
                            {t("notRead")}
                          </span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {lastReply ? (
                          <Link
                            href={threadHref}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)]"
                          >
                            {th.schoolUnread ? (
                              <span
                                aria-hidden
                                className="size-2 rounded-full bg-[color:var(--color-brand-500)]"
                              />
                            ) : null}
                            {t("repliedYes")}
                            <span className="font-normal tabular-nums text-[color:var(--color-foreground-subtle)]">
                              · {fmt.short(lastReply.createdAt)}
                            </span>
                            {th.schoolUnread ? (
                              <span className="sr-only"> ({t("newReply")})</span>
                            ) : null}
                          </Link>
                        ) : (
                          <span className="text-[color:var(--color-foreground-subtle)]">—</span>
                        )}
                      </TD>
                      <TD className="text-end">
                        <Link
                          href={threadHref}
                          aria-label={t("openConversation", { name })}
                          className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-brand-700)]"
                        >
                          <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                        </Link>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
          {countOf[currentShow] > threads.length ? (
            <p className="text-xs text-[color:var(--color-foreground-subtle)]">
              {t("capNote", { shown: threads.length, total: countOf[currentShow] })}
            </p>
          ) : null}
        </section>
      </main>
    );
  });
}

function StatTile({
  icon,
  tone,
  label,
  value,
  hint,
  progress,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number;
  hint?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-5 py-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-7 items-center justify-center rounded-md", tone)}>
          {icon}
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-foreground-muted)]">
          {label}
        </p>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--color-foreground)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-[color:var(--color-foreground-subtle)]">{hint}</p>
      ) : null}
      {progress != null ? (
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-sunken)]"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-[color:var(--color-success)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[color:var(--color-foreground-muted)]">{label}</dt>
      <dd className="text-end text-[color:var(--color-foreground)]">{children}</dd>
    </div>
  );
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((n * 100) / total)) : 0;
}

function formatBytes(n: number, locale: string): string {
  const mb = n / (1024 * 1024);
  if (mb >= 1) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "megabyte",
      unitDisplay: "short",
      maximumFractionDigits: 1,
    }).format(mb);
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(Math.max(1, Math.round(n / 1024)));
}

/**
 * Dates in the school's time zone (Tenant.timeZone), in the viewer's locale.
 * short(): today → "14:05"; this year → "12 sept., 14:05"; older → "12 sept. 2025".
 */
function dateFormatters(locale: string, timeZone: string | null | undefined) {
  let tz = timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const full = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: tz,
  });
  const stamp = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const dayMonthTime = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: tz });
  const key = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  });
  const todayKey = key.format(new Date());
  return {
    full: (d: Date) => full.format(d),
    stamp: (d: Date) => stamp.format(d),
    short: (d: Date) => {
      const k = key.format(d);
      if (k === todayKey) return time.format(d);
      if (k.slice(0, 4) === todayKey.slice(0, 4)) return dayMonthTime.format(d);
      return date.format(d);
    },
  };
}
