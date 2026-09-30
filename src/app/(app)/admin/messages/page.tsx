import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import {
  ArrowRight,
  Inbox,
  Megaphone,
  Paperclip,
  Send,
  SquarePen,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { FilterPill } from "@/components/ui/filter-pill";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { db } from "@/lib/db";
import { parentDisplayName } from "@/lib/messaging";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Staff messagerie — two link-based tabs:
 *   conversations (default) : every thread a parent has written in (a parent
 *                             opened it, or replied to a school message);
 *   sent                    : the school's sends (MessageBroadcast) with
 *                             read / reply stats.
 *
 * Every query runs INSIDE the page's runWithTenant callback (awaited) — the
 * child components below are synchronous on purpose: an async child server
 * component would render after the callback returned, outside the tenant
 * scope, and the scoped client would refuse to run.
 */

const BASE = "/admin/messages";
const THREAD_CAP = 200;
const SENT_CAP = 100;
const SNIPPET_MAX = 140;

const FILTERS = ["open", "unread", "closed", "all"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_WHERE: Record<Filter, Prisma.MessageThreadWhereInput> = {
  open: { status: "OPEN" },
  unread: { schoolUnread: true },
  closed: { status: "CLOSED" },
  all: {},
};

/** A thread is a "conversation" once a parent has written in it. */
const CONVERSATION_WHERE: Prisma.MessageThreadWhereInput = {
  OR: [{ origin: "PARENT" }, { posts: { some: { fromSchool: false } } }],
};

type T = (key: string, values?: Record<string, string | number | Date>) => string;
type Fmt = ReturnType<typeof dateFormatters>;

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string }>;
}) {
  const { tab, filter } = await searchParams;
  const { user, access } = await requireModuleAccess("communication", "read");
  const canWrite = hasModule(access, "communication", "write");
  const currentTab: "conversations" | "sent" = tab === "sent" ? "sent" : "conversations";
  const currentFilter: Filter = (FILTERS as readonly string[]).includes(filter ?? "")
    ? (filter as Filter)
    : "open";

  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const [t, locale, tenant, unreadCount, sentCount] = await Promise.all([
      getTranslations("messaging.inbox"),
      getLocale(),
      db.tenant.findUnique({
        where: { id: user.tenantId },
        select: { timeZone: true },
      }),
      db.messageThread.count({
        where: { ...CONVERSATION_WHERE, schoolUnread: true },
      }),
      db.messageBroadcast.count(),
    ]);
    const fmt = dateFormatters(locale, tenant?.timeZone);

    const conversations =
      currentTab === "conversations" ? await loadConversations(currentFilter) : null;
    const sent = currentTab === "sent" ? await loadSent() : null;

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <PageHeader
          title={t("title")}
          description={t("lead")}
          action={
            canWrite ? (
              <LinkButton href={`${BASE}/new`} size="sm" className="gap-2">
                <SquarePen className="size-4" aria-hidden />
                {t("newMessage")}
              </LinkButton>
            ) : undefined
          }
        />

        <nav
          aria-label={t("tabsLabel")}
          className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border-subtle)] pb-3"
        >
          <ViewTab
            href={BASE}
            label={t("tabConversations")}
            count={unreadCount}
            countLabel={t("tabUnreadCount", { count: unreadCount })}
            highlight={unreadCount > 0}
            active={currentTab === "conversations"}
          />
          <ViewTab
            href={`${BASE}?tab=sent`}
            label={t("tabSent")}
            count={sentCount}
            countLabel={t("tabSentCount", { count: sentCount })}
            active={currentTab === "sent"}
          />
        </nav>

        {conversations ? (
          <ConversationsTab
            data={conversations}
            filter={currentFilter}
            canWrite={canWrite}
            t={t}
            fmt={fmt}
          />
        ) : null}
        {sent ? (
          <SentTab data={sent} total={sentCount} canWrite={canWrite} t={t} fmt={fmt} />
        ) : null}
      </main>
    );
  });
}

// ── Data (called inside the tenant scope) ─────────────────────────────

async function loadConversations(filter: Filter) {
  const [threads, counts] = await Promise.all([
    db.messageThread.findMany({
      where: { ...CONVERSATION_WHERE, ...FILTER_WHERE[filter] },
      orderBy: [{ schoolUnread: "desc" }, { lastMessageAt: "desc" }],
      take: THREAD_CAP,
      select: {
        id: true,
        subject: true,
        status: true,
        schoolUnread: true,
        lastMessageAt: true,
        broadcastId: true,
        parent: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            guardianProfile: {
              select: {
                childLinks: { select: { student: { select: { firstName: true } } } },
              },
            },
          },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, fromSchool: true },
        },
      },
    }),
    Promise.all(
      FILTERS.map((f) =>
        db.messageThread.count({ where: { ...CONVERSATION_WHERE, ...FILTER_WHERE[f] } }),
      ),
    ),
  ]);
  const countOf = Object.fromEntries(FILTERS.map((f, i) => [f, counts[i]])) as Record<
    Filter,
    number
  >;
  return {
    countOf,
    rows: threads.map((th) => {
      const last = th.posts[0];
      return {
        id: th.id,
        subject: th.subject,
        closed: th.status === "CLOSED",
        unread: th.schoolUnread,
        lastMessageAt: th.lastMessageAt,
        fromBroadcast: !!th.broadcastId,
        parentName: parentDisplayName(th.parent),
        children: [
          ...new Set(
            (th.parent.guardianProfile?.childLinks ?? [])
              .map((l) => l.student.firstName?.trim())
              .filter((n): n is string => !!n),
          ),
        ],
        lastSnippet: last ? snippet(last.body) : null,
        lastFromSchool: last?.fromSchool ?? false,
      };
    }),
  };
}

async function loadSent() {
  const broadcasts = await db.messageBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: SENT_CAP,
    select: {
      id: true,
      subject: true,
      audienceLabel: true,
      recipientCount: true,
      allowReplies: true,
      createdAt: true,
      sender: { select: { name: true, firstName: true, lastName: true, email: true } },
      _count: { select: { attachments: true } },
    },
  });
  const ids = broadcasts.map((b) => b.id);
  const readBy = new Map<string, number>();
  const repliedBy = new Map<string, number>();
  if (ids.length) {
    const [readGroups, repliedGroups] = await Promise.all([
      db.messageThread.groupBy({
        by: ["broadcastId"],
        where: { broadcastId: { in: ids }, parentReadAt: { not: null } },
        _count: true,
      }),
      db.messageThread.groupBy({
        by: ["broadcastId"],
        where: { broadcastId: { in: ids }, posts: { some: { fromSchool: false } } },
        _count: true,
      }),
    ]);
    for (const g of readGroups) if (g.broadcastId) readBy.set(g.broadcastId, g._count);
    for (const g of repliedGroups) if (g.broadcastId) repliedBy.set(g.broadcastId, g._count);
  }
  return broadcasts.map((b) => ({
    id: b.id,
    subject: b.subject,
    audienceLabel: b.audienceLabel,
    recipientCount: b.recipientCount,
    allowReplies: b.allowReplies,
    createdAt: b.createdAt,
    senderName: parentDisplayName(b.sender),
    attachments: b._count.attachments,
    read: readBy.get(b.id) ?? 0,
    replied: repliedBy.get(b.id) ?? 0,
  }));
}

// ── Conversations ──────────────────────────────────────────────────────

function ConversationsTab({
  data,
  filter,
  canWrite,
  t,
  fmt,
}: {
  data: Awaited<ReturnType<typeof loadConversations>>;
  filter: Filter;
  canWrite: boolean;
  t: T;
  fmt: Fmt;
}) {
  const { rows, countOf } = data;
  const total = countOf[filter];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <FilterPill
            key={f}
            href={f === "open" ? BASE : `${BASE}?filter=${f}`}
            label={
              <span className="inline-flex items-center gap-1.5">
                {t(`filter_${f}`)}
                <span className="tabular-nums opacity-80">{countOf[f]}</span>
              </span>
            }
            active={filter === f}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden />}
          title={t(`empty_${filter}_title`)}
          body={t(`empty_${filter}_body`)}
          action={
            canWrite && (filter === "open" || filter === "all") ? (
              <LinkButton href={`${BASE}/new`} size="sm" variant="secondary" className="gap-2">
                <SquarePen className="size-4" aria-hidden />
                {t("newMessage")}
              </LinkButton>
            ) : null
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH className="text-start">{t("colParent")}</TH>
                <TH className="text-start">{t("colSubject")}</TH>
                <TH className="whitespace-nowrap text-start">{t("colLastMessage")}</TH>
                <TH className="text-start">{t("colStatus")}</TH>
                <TH className="w-[1%]">
                  <span className="sr-only">{t("open")}</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const href = `${BASE}/${r.id}`;
                return (
                  <TR
                    key={r.id}
                    className={r.unread ? "bg-[color:var(--color-brand-50)]/50" : undefined}
                  >
                    <TD className="min-w-[180px] align-top">
                      <div className="flex items-start gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            r.unread ? "bg-[color:var(--color-brand-500)]" : "bg-transparent",
                          )}
                        />
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "truncate text-[color:var(--color-foreground)]",
                              r.unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {r.parentName}
                          </p>
                          {r.children.length ? (
                            <p className="mt-0.5 truncate text-xs text-[color:var(--color-foreground-subtle)]">
                              {t("childrenOf", { names: r.children.join(", ") })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TD>
                    <TD className="min-w-[240px] max-w-[420px] align-top">
                      <Link
                        href={href}
                        className={cn(
                          "block truncate text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-600)]",
                          r.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {r.subject}
                      </Link>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2">
                        {r.fromBroadcast ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-foreground-muted)]">
                            <Megaphone className="size-2.5" aria-hidden />
                            {t("broadcastReply")}
                          </span>
                        ) : null}
                        {r.lastSnippet ? (
                          <p className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                            {r.lastFromSchool ? (
                              <span className="text-[color:var(--color-foreground-subtle)]">
                                {t("youPrefix")}{" "}
                              </span>
                            ) : null}
                            {r.lastSnippet}
                          </p>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap align-top tabular-nums text-[color:var(--color-foreground-muted)]">
                      <time
                        dateTime={r.lastMessageAt.toISOString()}
                        title={fmt.full(r.lastMessageAt)}
                        className={
                          r.unread
                            ? "font-semibold text-[color:var(--color-foreground)]"
                            : undefined
                        }
                      >
                        {fmt.short(r.lastMessageAt)}
                      </time>
                    </TD>
                    <TD className="align-top">
                      <ThreadStatusBadge unread={r.unread} closed={r.closed} t={t} />
                    </TD>
                    <TD className="align-top text-end">
                      <Link
                        href={href}
                        aria-label={t("openConversation", { subject: r.subject })}
                        className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-brand-700)]"
                      >
                        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          {total > rows.length ? (
            <p className="text-xs text-[color:var(--color-foreground-subtle)]">
              {t("capNote", { shown: rows.length, total })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function ThreadStatusBadge({
  unread,
  closed,
  t,
}: {
  unread: boolean;
  closed: boolean;
  t: T;
}) {
  if (unread) {
    return (
      <span className="inline-flex items-center rounded-full bg-[color:var(--color-brand-500)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-foreground-onbrand)]">
        {t("statusUnread")}
      </span>
    );
  }
  if (closed) {
    return (
      <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-foreground-subtle)]">
        {t("statusClosed")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success-soft-fg)]">
      {t("statusOpen")}
    </span>
  );
}

// ── Sent ───────────────────────────────────────────────────────────────

function SentTab({
  data,
  total,
  canWrite,
  t,
  fmt,
}: {
  data: Awaited<ReturnType<typeof loadSent>>;
  total: number;
  canWrite: boolean;
  t: T;
  fmt: Fmt;
}) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Send className="size-6" aria-hidden />}
        title={t("sentEmptyTitle")}
        body={t("sentEmptyBody")}
        action={
          canWrite ? (
            <LinkButton href={`${BASE}/new`} size="sm" className="gap-2">
              <SquarePen className="size-4" aria-hidden />
              {t("newMessage")}
            </LinkButton>
          ) : null
        }
      />
    );
  }

  return (
    <section className="space-y-4">
      <Table>
        <THead>
          <tr>
            <TH className="text-start">{t("colSubject")}</TH>
            <TH className="text-start">{t("colRecipients")}</TH>
            <TH className="whitespace-nowrap text-start">{t("colSentAt")}</TH>
            <TH className="text-start">{t("colSender")}</TH>
            <TH className="text-start">{t("colRead")}</TH>
            <TH className="text-end">{t("colReplies")}</TH>
            <TH className="w-[1%]">
              <span className="sr-only">{t("open")}</span>
            </TH>
          </tr>
        </THead>
        <tbody>
          {data.map((b) => {
            const href = `${BASE}/sent/${b.id}`;
            const pct = b.recipientCount
              ? Math.min(100, Math.round((b.read * 100) / b.recipientCount))
              : 0;
            return (
              <TR key={b.id}>
                <TD className="min-w-[220px] max-w-[360px] align-top">
                  <Link
                    href={href}
                    className="block truncate font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-600)]"
                  >
                    {b.subject}
                  </Link>
                  {b.attachments > 0 ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-subtle)]">
                      <Paperclip className="size-3" aria-hidden />
                      {t("attachmentCount", { count: b.attachments })}
                    </span>
                  ) : null}
                </TD>
                <TD className="min-w-[160px] max-w-[260px] align-top">
                  <p className="line-clamp-2 text-[color:var(--color-foreground)]">
                    {b.audienceLabel || "—"}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-[color:var(--color-foreground-subtle)]">
                    {t("parentCount", { count: b.recipientCount })}
                  </p>
                </TD>
                <TD className="whitespace-nowrap align-top tabular-nums text-[color:var(--color-foreground-muted)]">
                  <time dateTime={b.createdAt.toISOString()} title={fmt.full(b.createdAt)}>
                    {fmt.short(b.createdAt)}
                  </time>
                </TD>
                <TD className="align-top text-[color:var(--color-foreground-muted)]">
                  {b.senderName}
                </TD>
                <TD className="min-w-[130px] align-top">
                  <div className="flex items-baseline justify-between gap-2 tabular-nums">
                    <span className="text-[color:var(--color-foreground)]">
                      {b.read}
                      <span className="text-[color:var(--color-foreground-subtle)]">
                        {" / "}
                        {b.recipientCount}
                      </span>
                    </span>
                    <span className="text-xs text-[color:var(--color-foreground-subtle)]">
                      {pct}%
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-sunken)]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-label={t("readProgress", { read: b.read, total: b.recipientCount })}
                  >
                    <div
                      className="h-full rounded-full bg-[color:var(--color-brand-500)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </TD>
                <TD className="align-top text-end tabular-nums">
                  {b.allowReplies || b.replied > 0 ? (
                    <span
                      className={
                        b.replied > 0
                          ? "font-medium text-[color:var(--color-foreground)]"
                          : "text-[color:var(--color-foreground-subtle)]"
                      }
                    >
                      {b.replied}
                    </span>
                  ) : (
                    <span
                      className="text-[color:var(--color-foreground-subtle)]"
                      title={t("repliesOff")}
                    >
                      —<span className="sr-only"> {t("repliesOff")}</span>
                    </span>
                  )}
                </TD>
                <TD className="align-top text-end">
                  <Link
                    href={href}
                    aria-label={t("openSent", { subject: b.subject })}
                    className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-brand-700)]"
                  >
                    <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                  </Link>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      {total > data.length ? (
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">
          {t("capNote", { shown: data.length, total })}
        </p>
      ) : null}
    </section>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────

function ViewTab({
  href,
  label,
  count,
  countLabel,
  active,
  highlight,
}: {
  href: string;
  label: string;
  count: number;
  countLabel: string;
  active: boolean;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
        active
          ? "text-[color:var(--color-foreground)]"
          : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      <span>{label}</span>
      <span
        title={countLabel}
        className={cn(
          "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
          highlight
            ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]"
            : active
              ? "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]"
              : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
        )}
      >
        <span aria-hidden>{count}</span>
        <span className="sr-only">{countLabel}</span>
      </span>
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-3 h-0.5 rounded-full bg-[color:var(--color-brand-600)]"
        />
      ) : null}
    </Link>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-[color:var(--color-foreground)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[color:var(--color-foreground-muted)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function snippet(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1)}…` : flat;
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
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  });
  const key = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  });
  const todayKey = key.format(new Date());
  return {
    full: (d: Date) => full.format(d),
    short: (d: Date) => {
      const k = key.format(d);
      if (k === todayKey) return time.format(d);
      if (k.slice(0, 4) === todayKey.slice(0, 4)) return dayMonthTime.format(d);
      return date.format(d);
    },
  };
}
