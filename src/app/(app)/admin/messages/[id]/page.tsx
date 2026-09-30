import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Info,
  Lock,
  Mail,
  Megaphone,
  Paperclip,
  UserRound,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { parentDisplayName } from "@/lib/messaging";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { getSignedDownloadUrl } from "@/lib/storage";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { ThreadReply, ThreadStatusButton } from "./_reply";

/**
 * One school ⇄ parent conversation. Opening it clears the school-side unread
 * flag — only for viewers with communication:write, so a read-only look
 * leaves it unread for the team. Bodies are untrusted parent/staff text →
 * rendered as plain text only.
 */

type T = (key: string, values?: Record<string, string | number | Date>) => string;

type Attachment = { id: string; fileName: string; sizeBytes: number; url: string | null };

type TimelineItem = {
  key: string;
  fromSchool: boolean;
  author: string;
  at: Date;
  body: string;
  isBroadcast?: boolean;
  attachments?: Attachment[];
};

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, access } = await requireModuleAccess("communication", "read");
  const canWrite = hasModule(access, "communication", "write");
  // /admin/parents/[id] (keyed by the parent's User id) is guarded by "eleves".
  const canSeeParentFile = hasModule(access, "eleves", "read");

  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const [t, locale, tenant, thread] = await Promise.all([
      getTranslations("messaging.thread"),
      getLocale(),
      db.tenant.findUnique({ where: { id: user.tenantId }, select: { timeZone: true } }),
      db.messageThread.findFirst({
        where: { id },
        select: {
          id: true,
          subject: true,
          status: true,
          origin: true,
          allowReplies: true,
          schoolUnread: true,
          parentUnread: true,
          parentReadAt: true,
          closedAt: true,
          createdAt: true,
          broadcastId: true,
          parent: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              guardianProfile: {
                select: {
                  childLinks: {
                    select: { student: { select: { firstName: true, lastName: true } } },
                  },
                },
              },
            },
          },
          broadcast: {
            select: {
              id: true,
              subject: true,
              body: true,
              createdAt: true,
              allowReplies: true,
              audienceLabel: true,
              recipientCount: true,
              sender: { select: { name: true, firstName: true, lastName: true, email: true } },
              attachments: {
                orderBy: { createdAt: "asc" },
                select: { id: true, fileName: true, sizeBytes: true, storagePath: true },
              },
            },
          },
          posts: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              body: true,
              fromSchool: true,
              createdAt: true,
              author: { select: { name: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      }),
    ]);
    if (!thread) notFound();

    if (thread.schoolUnread && canWrite) {
      await db.messageThread.update({
        where: { id: thread.id },
        data: { schoolUnread: false, schoolReadAt: new Date(), schoolReadByUserId: user.id },
      });
    }

    // Signed links only now — the thread was found inside this tenant and the
    // viewer holds communication:read.
    const attachments: Attachment[] = thread.broadcast
      ? await Promise.all(
          thread.broadcast.attachments.map(async (a) => ({
            id: a.id,
            fileName: a.fileName,
            sizeBytes: a.sizeBytes,
            url: await getSignedDownloadUrl(a.storagePath),
          })),
        )
      : [];

    const fmt = dateFormatters(locale, tenant?.timeZone);
    const parentName = parentDisplayName(thread.parent);
    const children = [
      ...new Set(
        (thread.parent.guardianProfile?.childLinks ?? [])
          .map((l) => [l.student.firstName, l.student.lastName].filter(Boolean).join(" ").trim())
          .filter(Boolean),
      ),
    ];
    const closed = thread.status === "CLOSED";

    const items: TimelineItem[] = [];
    if (thread.broadcast) {
      items.push({
        key: `b-${thread.broadcast.id}`,
        fromSchool: true,
        author: parentDisplayName(thread.broadcast.sender),
        at: thread.broadcast.createdAt,
        body: thread.broadcast.body,
        isBroadcast: true,
        attachments,
      });
    }
    for (const p of thread.posts) {
      items.push({
        key: p.id,
        fromSchool: p.fromSchool,
        author: p.fromSchool ? parentDisplayName(p.author) : parentName,
        at: p.createdAt,
        body: p.body,
      });
    }
    const lastIsSchool = items.at(-1)?.fromSchool ?? false;

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-3">
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:text-[color:var(--color-foreground)]"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("back")}
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
                  {thread.subject}
                </h1>
                {closed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-foreground-subtle)]">
                    <Lock className="size-3" aria-hidden />
                    {t("statusClosed")}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success-soft-fg)]">
                    {t("statusOpen")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
                {thread.origin === "PARENT"
                  ? t("startedByParent", { name: parentName, date: fmt.date(thread.createdAt) })
                  : t("startedBySchool", { date: fmt.date(thread.createdAt) })}
              </p>
            </div>
            {canWrite ? (
              <ThreadStatusButton threadId={thread.id} closed={closed} />
            ) : null}
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Conversation ─────────────────────────────── */}
          <div className="min-w-0 space-y-4">
            <Card>
              <CardBody className="space-y-5">
                {items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--color-foreground-muted)]">
                    {t("emptyTimeline")}
                  </p>
                ) : (
                  items.map((it, i) => (
                    <Bubble
                      key={it.key}
                      item={it}
                      t={t}
                      stamp={fmt.stamp(it.at)}
                      stampTitle={fmt.full(it.at)}
                      formatSize={(n) => formatBytes(n, locale)}
                      receipt={
                        i === items.length - 1 && lastIsSchool
                          ? thread.parentUnread
                            ? "unread"
                            : "read"
                          : null
                      }
                    />
                  ))
                )}

                {!thread.allowReplies || closed ? (
                  <div className="space-y-2 border-t border-[color:var(--color-border-subtle)] pt-4">
                    {!thread.allowReplies ? (
                      <Note icon={<Info className="size-4" aria-hidden />}>
                        {t("noteRepliesDisabled")}
                      </Note>
                    ) : null}
                    {closed ? (
                      <Note icon={<Lock className="size-4" aria-hidden />}>
                        {canWrite ? t("noteClosedCanReopen") : t("noteClosed")}
                      </Note>
                    ) : null}
                  </div>
                ) : null}
              </CardBody>
            </Card>

            {canWrite ? (
              <ThreadReply
                threadId={thread.id}
                closed={closed}
                allowReplies={thread.allowReplies}
                parentName={parentName}
              />
            ) : null}
          </div>

          {/* ── Side panel ───────────────────────────────── */}
          <aside className="space-y-4">
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-sm font-semibold text-[color:var(--color-brand-700)]">
                    {initials(parentName) || <UserRound className="size-5" aria-hidden />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-foreground-subtle)]">
                      {t("parentLabel")}
                    </p>
                    <p className="truncate font-semibold text-[color:var(--color-foreground)]">
                      {parentName}
                    </p>
                  </div>
                </div>

                {thread.parent.email ? (
                  <a
                    href={`mailto:${thread.parent.email}`}
                    className="flex min-w-0 items-center gap-2 text-sm text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-600)]"
                  >
                    <Mail className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{thread.parent.email}</span>
                  </a>
                ) : null}

                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[color:var(--color-foreground-subtle)]">
                    {t("childrenLabel")}
                  </p>
                  {children.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {children.map((c) => (
                        <li
                          key={c}
                          className="rounded-full bg-[color:var(--color-surface-sunken)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--color-foreground)]"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[color:var(--color-foreground-subtle)]">
                      {t("noChildren")}
                    </p>
                  )}
                </div>

                {canSeeParentFile ? (
                  <Link
                    href={`/admin/parents/${thread.parent.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)]"
                  >
                    {t("parentFile")}
                    <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                  </Link>
                ) : null}
              </CardBody>
            </Card>

            {thread.broadcast ? (
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                      <Megaphone className="size-4" aria-hidden />
                    </div>
                    <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      {t("broadcastTitle")}
                    </p>
                  </div>
                  <p className="text-sm text-[color:var(--color-foreground-muted)]">
                    {t("broadcastHint", { count: thread.broadcast.recipientCount })}
                  </p>
                  {thread.broadcast.audienceLabel ? (
                    <p className="text-sm text-[color:var(--color-foreground)]">
                      {thread.broadcast.audienceLabel}
                    </p>
                  ) : null}
                  <Link
                    href={`/admin/messages/sent/${thread.broadcast.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)]"
                  >
                    {t("viewBroadcast")}
                    <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                  </Link>
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardBody>
                <dl className="space-y-3 text-sm">
                  <DetailRow label={t("detailOrigin")}>
                    {thread.origin === "PARENT" ? t("originParent") : t("originSchool")}
                  </DetailRow>
                  <DetailRow label={t("detailOpened")}>
                    <time dateTime={thread.createdAt.toISOString()}>
                      {fmt.stamp(thread.createdAt)}
                    </time>
                  </DetailRow>
                  <DetailRow label={t("detailParentRead")}>
                    {thread.parentReadAt ? (
                      <time dateTime={thread.parentReadAt.toISOString()}>
                        {fmt.stamp(thread.parentReadAt)}
                      </time>
                    ) : (
                      <span className="text-[color:var(--color-foreground-subtle)]">
                        {t("notYet")}
                      </span>
                    )}
                  </DetailRow>
                  {closed && thread.closedAt ? (
                    <DetailRow label={t("detailClosed")}>
                      <time dateTime={thread.closedAt.toISOString()}>
                        {fmt.stamp(thread.closedAt)}
                      </time>
                    </DetailRow>
                  ) : null}
                </dl>
              </CardBody>
            </Card>
          </aside>
        </div>
      </main>
    );
  });
}

function Bubble({
  item,
  t,
  stamp,
  stampTitle,
  formatSize,
  receipt,
}: {
  item: TimelineItem;
  t: T;
  stamp: string;
  stampTitle: string;
  formatSize: (n: number) => string;
  receipt: "read" | "unread" | null;
}) {
  const school = item.fromSchool;
  return (
    <div className={cn("flex", school ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[88%] flex-col gap-1 sm:max-w-[80%]", school && "items-end")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-xs">
          <span className="font-medium text-[color:var(--color-foreground)]">{item.author}</span>
          {item.isBroadcast ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-brand-50)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-brand-700)]">
              <Megaphone className="size-2.5" aria-hidden />
              {t("broadcastBadge")}
            </span>
          ) : school ? (
            <span className="inline-flex items-center rounded-full bg-[color:var(--color-brand-50)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-brand-700)]">
              {t("schoolBadge")}
            </span>
          ) : null}
          <time
            dateTime={item.at.toISOString()}
            title={stampTitle}
            className="tabular-nums text-[color:var(--color-foreground-subtle)]"
          >
            {stamp}
          </time>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed text-[color:var(--color-foreground)]",
            school
              ? "rounded-se-md border border-[color:var(--color-brand-100)] bg-[color:var(--color-brand-50)]"
              : "rounded-ss-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)]",
          )}
        >
          <p className="whitespace-pre-line break-words">{item.body}</p>
          {item.attachments?.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("attachmentsLabel")}>
              {item.attachments.map((a) => (
                <li key={a.id}>
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:border-[color:var(--color-brand-500)]/40 hover:text-[color:var(--color-brand-600)]"
                    >
                      <Paperclip className="size-3.5 shrink-0" aria-hidden />
                      <span className="max-w-[220px] truncate">{a.fileName}</span>
                      <span className="shrink-0 text-[color:var(--color-foreground-subtle)]">
                        {formatSize(a.sizeBytes)}
                      </span>
                    </a>
                  ) : (
                    <span
                      title={t("attachmentUnavailable")}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-[color:var(--color-border-strong)] px-2.5 py-1.5 text-xs text-[color:var(--color-foreground-subtle)]"
                    >
                      <Paperclip className="size-3.5 shrink-0" aria-hidden />
                      <span className="max-w-[220px] truncate">{a.fileName}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {receipt ? (
          <p className="inline-flex items-center gap-1 px-1 text-[11px] text-[color:var(--color-foreground-subtle)]">
            {receipt === "read" ? (
              <CheckCheck className="size-3.5 text-[color:var(--color-brand-600)]" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            {receipt === "read" ? t("receiptRead") : t("receiptUnread")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Note({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-[color:var(--color-surface-sunken)] px-3 py-2 text-xs text-[color:var(--color-foreground-muted)]">
      <span className="mt-px shrink-0 text-[color:var(--color-foreground-subtle)]">{icon}</span>
      <span>{children}</span>
    </p>
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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

/** Dates in the school's time zone (Tenant.timeZone), in the viewer's locale. */
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
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: tz });
  return {
    full: (d: Date) => full.format(d),
    stamp: (d: Date) => stamp.format(d),
    date: (d: Date) => date.format(d),
  };
}
