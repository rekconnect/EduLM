import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  Download,
  FileImage,
  FileText,
  Info,
  Lock,
  Paperclip,
  School,
} from "lucide-react";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { getSignedDownloadUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { ReplyBox, SeenSync } from "./_reply";

/**
 * One parent ⇄ school conversation. The lookup is pinned to
 * `parentUserId: user.id` — a parent can never open (or detect) another
 * family's thread; anything else is a 404. Attachment links are signed only
 * after that ownership check.
 */

function validTimeZone(tz: string | null | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

function staffName(u: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
} | null): string {
  if (!u) return "";
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.name?.trim() || "";
}

function fileSize(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
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
  }).format(Math.max(1, Math.round(bytes / 1024)));
}

export default async function ParentThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withParentSession(async (user) => {
    const t = await getTranslations("messaging.parent");
    const locale = await getLocale();

    const thread = await db.messageThread.findFirst({
      where: { id, parentUserId: user.id },
      select: {
        id: true,
        subject: true,
        origin: true,
        allowReplies: true,
        status: true,
        parentUnread: true,
        parentReadAt: true,
        broadcast: {
          select: {
            body: true,
            createdAt: true,
            sender: { select: { firstName: true, lastName: true, name: true } },
            attachments: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                storagePath: true,
              },
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
            author: { select: { firstName: true, lastName: true, name: true } },
          },
        },
      },
    });
    if (!thread) notFound();

    const wasUnread = thread.parentUnread;
    if (wasUnread) {
      // parentReadAt keeps the FIRST opening (read stats); the flag drives badges.
      await db.messageThread.updateMany({
        where: { id: thread.id, parentUserId: user.id },
        data: {
          parentUnread: false,
          parentReadAt: thread.parentReadAt ?? new Date(),
        },
      });
    }

    // Ownership verified above → safe to sign the attachment links now.
    const [attachments, tenant] = await Promise.all([
      Promise.all(
        (thread.broadcast?.attachments ?? []).map(async (a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: await getSignedDownloadUrl(a.storagePath).catch(() => null),
        })),
      ),
      db.tenant.findUnique({
        where: { id: user.tenantId },
        select: { timeZone: true },
      }),
    ]);

    const dateFmt = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: validTimeZone(tenant?.timeZone),
    });

    const schoolLabel = (name: string) =>
      name ? t("schoolWithSender", { name }) : t("schoolName");

    const writeLink = (chunks: React.ReactNode) => (
      <Link
        href={`/parent/messages/new?about=${encodeURIComponent(thread.id)}`}
        className="font-medium text-[color:var(--color-brand-600)] underline-offset-2 transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)] hover:underline"
      >
        {chunks}
      </Link>
    );

    const canReply = thread.allowReplies && thread.status === "OPEN";
    const isEmpty = !thread.broadcast && thread.posts.length === 0;

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {wasUnread ? <SeenSync /> : null}

        <div>
          <Link
            href="/parent/messages"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:text-[color:var(--color-foreground)]"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("backToMessages")}
          </Link>
          <h1 className="mt-3 break-words text-2xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
            {thread.subject}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                thread.origin === "SCHOOL"
                  ? "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]"
                  : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
              )}
            >
              {thread.origin === "SCHOOL" ? t("originSchool") : t("originMine")}
            </span>
            {thread.status === "CLOSED" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                <Lock className="size-3" aria-hidden />
                {t("closedBadge")}
              </span>
            ) : null}
          </div>
        </div>

        <ol aria-label={t("timelineLabel")} className="space-y-5">
          {thread.broadcast ? (
            <Bubble
              side="start"
              author={schoolLabel(staffName(thread.broadcast.sender))}
              date={thread.broadcast.createdAt}
              dateLabel={dateFmt.format(thread.broadcast.createdAt)}
              body={thread.broadcast.body}
            >
              {attachments.length ? (
                <div className="mt-3 border-t border-[color:var(--color-border-subtle)] pt-3">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--color-foreground-muted)]">
                    <Paperclip className="size-3.5" aria-hidden />
                    {t("attachmentsTitle")}
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {attachments.map((a) => {
                      const Icon = a.mimeType.startsWith("image/") ? FileImage : FileText;
                      const inner = (
                        <>
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[color:var(--color-foreground)]">
                              {a.fileName}
                            </span>
                            <span className="block text-xs text-[color:var(--color-foreground-subtle)]">
                              {a.url ? fileSize(a.sizeBytes, locale) : t("attachmentUnavailable")}
                            </span>
                          </span>
                          {a.url ? (
                            <Download
                              className="size-4 shrink-0 text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out group-hover:text-[color:var(--color-brand-600)]"
                              aria-hidden
                            />
                          ) : null}
                        </>
                      );
                      return (
                        <li key={a.id}>
                          {a.url ? (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={t("downloadFile", { name: a.fileName })}
                              className="group flex items-center gap-2.5 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-2.5 py-2 transition-colors duration-150 ease-out hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
                            >
                              {inner}
                            </a>
                          ) : (
                            <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-[color:var(--color-border-subtle)] px-2.5 py-2 opacity-70">
                              {inner}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </Bubble>
          ) : null}

          {thread.posts.map((p) => (
            <Bubble
              key={p.id}
              side={p.fromSchool ? "start" : "end"}
              author={p.fromSchool ? schoolLabel(staffName(p.author)) : t("you")}
              date={p.createdAt}
              dateLabel={dateFmt.format(p.createdAt)}
              body={p.body}
            />
          ))}

          {isEmpty ? (
            <li className="rounded-card border border-dashed border-[color:var(--color-border-strong)] px-6 py-10 text-center text-sm text-[color:var(--color-foreground-muted)]">
              {t("threadEmpty")}
            </li>
          ) : null}
        </ol>

        {canReply ? (
          <ReplyBox threadId={thread.id} />
        ) : (
          <div className="flex items-start gap-3 rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground-muted)]">
              {thread.allowReplies ? (
                <Lock className="size-3.5" aria-hidden />
              ) : (
                <Info className="size-3.5" aria-hidden />
              )}
            </span>
            <p className="text-sm leading-relaxed text-[color:var(--color-foreground-muted)]">
              {thread.allowReplies
                ? t.rich("closedNote", { link: writeLink })
                : t.rich("repliesDisabled", { link: writeLink })}
            </p>
          </div>
        )}
      </main>
    );
  });
}

function Bubble({
  side,
  author,
  date,
  dateLabel,
  body,
  children,
}: {
  side: "start" | "end";
  author: string;
  date: Date;
  dateLabel: string;
  body: string;
  children?: React.ReactNode;
}) {
  const mine = side === "end";
  return (
    <li className={cn("flex gap-2.5", mine ? "justify-end" : "justify-start")}>
      {!mine ? (
        <span className="mt-5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
          <School className="size-4" aria-hidden />
        </span>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 max-w-[88%] flex-col sm:max-w-[78%]",
          mine ? "items-end" : "items-start",
          children ? "w-full" : null,
        )}
      >
        <div
          className={cn(
            "mb-1 flex flex-wrap items-baseline gap-x-2 px-1 text-xs",
            mine && "justify-end",
          )}
        >
          <span className="font-medium text-[color:var(--color-foreground)]">{author}</span>
          <time
            dateTime={date.toISOString()}
            className="tabular-nums text-[color:var(--color-foreground-subtle)]"
          >
            {dateLabel}
          </time>
        </div>
        <div
          className={cn(
            "max-w-full rounded-2xl border px-4 py-3 shadow-card",
            // Attachment grid needs room — let that bubble fill its column.
            children ? "w-full" : null,
            mine
              ? "rounded-se-md border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)]"
              : "rounded-ss-md border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
          )}
        >
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[color:var(--color-foreground)]">
            {body}
          </p>
          {children}
        </div>
      </div>
    </li>
  );
}
