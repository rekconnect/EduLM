import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  CheckCheck,
  Lock,
  MessagesSquare,
  Paperclip,
  School,
  SquarePen,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { FilterPill } from "@/components/ui/filter-pill";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Parent messagerie — every conversation with the school, newest activity
 * first. Threads are private per parent (a reply to a group message is only
 * ever seen by the school), so the query is pinned to parentUserId.
 */

const LIST_CAP = 200;
const SNIPPET_MAX = 160;

function validTimeZone(tz: string | null | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** Short list date: time today, "12 sept." this year, "12 sept. 2025" before. */
function listDateFormatter(locale: string, timeZone: string | undefined) {
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  });
  const full = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  const long = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  });
  const today = dayKey.format(new Date());
  return {
    short(d: Date): string {
      const k = dayKey.format(d);
      if (k === today) return time.format(d);
      if (k.slice(0, 4) === today.slice(0, 4)) return dayMonth.format(d);
      return full.format(d);
    },
    long(d: Date): string {
      return long.format(d);
    },
  };
}

function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1)}…` : flat;
}

export default async function ParentMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";

  return withParentSession(async (user) => {
    const t = await getTranslations("messaging.parent");
    const locale = await getLocale();

    const [threads, totalCount, unreadCount, tenant] = await Promise.all([
      db.messageThread.findMany({
        where: {
          parentUserId: user.id,
          ...(unreadOnly ? { parentUnread: true } : {}),
        },
        orderBy: { lastMessageAt: "desc" },
        take: LIST_CAP + 1,
        select: {
          id: true,
          subject: true,
          origin: true,
          status: true,
          parentUnread: true,
          lastMessageAt: true,
          broadcast: {
            select: {
              body: true,
              _count: { select: { attachments: true } },
            },
          },
          posts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, fromSchool: true },
          },
        },
      }),
      db.messageThread.count({ where: { parentUserId: user.id } }),
      db.messageThread.count({
        where: { parentUserId: user.id, parentUnread: true },
      }),
      db.tenant.findUnique({
        where: { id: user.tenantId },
        select: { timeZone: true },
      }),
    ]);

    const truncated = threads.length > LIST_CAP;
    const rows = truncated ? threads.slice(0, LIST_CAP) : threads;
    const fmt = listDateFormatter(locale, validTimeZone(tenant?.timeZone));

    const writeAction = (
      <LinkButton href="/parent/messages/new" size="sm" className="gap-1.5">
        <SquarePen className="size-4" aria-hidden />
        {t("writeToSchool")}
      </LinkButton>
    );

    return (
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          title={t("title")}
          description={t("lead")}
          action={totalCount > 0 ? writeAction : undefined}
        />

        {totalCount === 0 ? (
          <EmptyState
            icon={<MessagesSquare className="size-6" aria-hidden />}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={writeAction}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill
                href="/parent/messages"
                label={t("filterAll", { count: totalCount })}
                active={!unreadOnly}
              />
              <FilterPill
                href="/parent/messages?filter=unread"
                label={t("filterUnread", { count: unreadCount })}
                active={unreadOnly}
              />
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={<CheckCheck className="size-6" aria-hidden />}
                title={t("emptyUnreadTitle")}
                body={t("emptyUnreadBody")}
                action={
                  <LinkButton href="/parent/messages" size="sm" variant="secondary">
                    {t("showAll")}
                  </LinkButton>
                }
              />
            ) : (
              <ul
                aria-label={t("listLabel")}
                className="divide-y divide-[color:var(--color-border-subtle)] overflow-hidden rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card"
              >
                {rows.map((th) => {
                  const latest = th.posts[0] ?? null;
                  const text = latest?.body ?? th.broadcast?.body ?? "";
                  const snippet = oneLine(text);
                  const mine = latest ? !latest.fromSchool : false;
                  const fromSchool = th.origin === "SCHOOL";
                  const unread = th.parentUnread;
                  const files = th.broadcast?._count.attachments ?? 0;
                  const closed = th.status === "CLOSED";
                  return (
                    <li key={th.id}>
                      <Link
                        href={`/parent/messages/${th.id}`}
                        className={cn(
                          "group flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 ease-out sm:px-5",
                          "hover:bg-[color:var(--color-surface-hover)] focus-visible:bg-[color:var(--color-surface-hover)] focus-visible:outline-none",
                          unread && "bg-[color:var(--color-brand-50)]/40",
                        )}
                      >
                        <div className="relative mt-0.5 shrink-0">
                          <div
                            className={cn(
                              "flex size-9 items-center justify-center rounded-full",
                              fromSchool
                                ? "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]"
                                : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
                            )}
                          >
                            {fromSchool ? (
                              <School className="size-4" aria-hidden />
                            ) : (
                              <UserRound className="size-4" aria-hidden />
                            )}
                          </div>
                          {unread ? (
                            <span
                              aria-hidden
                              className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-[color:var(--color-brand-500)] ring-2 ring-[color:var(--color-surface-raised)]"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                "min-w-0 truncate text-sm text-[color:var(--color-foreground)] transition-colors duration-150 ease-out group-hover:text-[color:var(--color-brand-700)]",
                                unread ? "font-semibold" : "font-medium",
                              )}
                            >
                              {th.subject}
                            </p>
                            {unread ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--color-brand-500)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-onbrand)]">
                                {t("newBadge")}
                              </span>
                            ) : null}
                            <time
                              dateTime={th.lastMessageAt.toISOString()}
                              title={fmt.long(th.lastMessageAt)}
                              className={cn(
                                "ms-auto shrink-0 ps-2 text-xs tabular-nums",
                                unread
                                  ? "font-semibold text-[color:var(--color-brand-700)]"
                                  : "text-[color:var(--color-foreground-subtle)]",
                              )}
                            >
                              {fmt.short(th.lastMessageAt)}
                            </time>
                          </div>

                          {snippet ? (
                            <p
                              className={cn(
                                "mt-0.5 truncate text-sm",
                                unread
                                  ? "text-[color:var(--color-foreground)]"
                                  : "text-[color:var(--color-foreground-muted)]",
                              )}
                            >
                              {mine ? t("snippetMine", { text: snippet }) : snippet}
                            </p>
                          ) : null}

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                                fromSchool
                                  ? "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]"
                                  : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
                              )}
                            >
                              {fromSchool ? t("originSchool") : t("originMine")}
                            </span>
                            {closed ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                                <Lock className="size-2.5" aria-hidden />
                                {t("closedBadge")}
                              </span>
                            ) : null}
                            {files > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[color:var(--color-foreground-subtle)]">
                                <Paperclip className="size-3" aria-hidden />
                                {t("attachmentsCount", { count: files })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {truncated ? (
              <p className="text-center text-xs text-[color:var(--color-foreground-subtle)]">
                {t("truncatedNote", { count: LIST_CAP })}
              </p>
            ) : null}
          </>
        )}
      </main>
    );
  });
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
    <div className="flex flex-col items-center rounded-card border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-[color:var(--color-foreground)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[color:var(--color-foreground-muted)]">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
